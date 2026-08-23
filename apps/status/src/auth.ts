import bcrypt from "bcryptjs"
import { randomUUID } from "node:crypto"
import type {
  AdminMfaChallengeMaterial,
  PasswordCredentialMatch,
  StatusAdminLinkPurpose,
  StatusAdminSummary,
  StatusDatabase,
  StatusSessionPrincipal,
} from "./db.js"
import { StatusAdminStoreError } from "./db.js"
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  matchingTotpStep,
  recoveryCodeHash,
  totpUri,
} from "./mfa.js"
import {
  hmacSha256,
  normalizeEmail,
  randomToken,
  sha256,
  validEmail,
  validPassword,
} from "./util.js"

export class AuthError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "ALREADY_INITIALIZED" | "NOT_INITIALIZED"
      | "GENERATION_MISMATCH" | "PENDING_CHANGE" | "INVALID_CREDENTIALS" | "RATE_LIMITED"
      | "MFA_CHALLENGE_INVALID" | "ADMIN_ALREADY_EXISTS" | "ADMIN_NOT_FOUND"
      | "ADMIN_STATE_INVALID" | "PROTECTED_ADMIN" | "LAST_ADMIN" | "TOKEN_INVALID",
    message: string,
  ) {
    super(message)
  }
}

export type LoginResult = {
  sessionToken: string
  kind: "password" | "recovery"
}

export type MfaLoginChallenge = {
  challengeToken: string
  expiresAt: string
  enrollmentRequired: boolean
  manualKey?: string
  otpauthUri?: string
}

export type MfaLoginResult = LoginResult & {
  recoveryCodes?: string[]
}

export type StatusAdminOneTimeToken = {
  purpose: StatusAdminLinkPurpose
  token: string
  expiresAt: string
}

const SECURITY_EVENTS = {
  STATUS_AUTH_INITIALIZED: ["info", "Status administrator credentials initialized"],
  STATUS_AUTH_CHANGE_PREPARED: ["info", "An administrator credential change was prepared"],
  STATUS_AUTH_CHANGED: ["info", "Status administrator credentials changed"],
  STATUS_AUTH_CHANGE_ABORTED: ["warning", "A pending administrator credential change was aborted"],
  STATUS_RECOVERY_TOKEN_ISSUED: ["warning", "A one-use Status recovery token was issued"],
  STATUS_LOGIN_SUCCEEDED: ["info", "A Status administrator signed in"],
  STATUS_RECOVERY_LOGIN_SUCCEEDED: ["warning", "A Status recovery token was used"],
  STATUS_LOGIN_FAILED: ["warning", "A Status sign-in attempt failed"],
  STATUS_LOGIN_RATE_LIMITED: ["warning", "Status sign-in attempts were rate limited"],
  STATUS_MFA_CHALLENGE_ISSUED: ["info", "A Status MFA challenge was issued"],
  STATUS_MFA_ENROLLED: ["info", "Status administrator MFA was enrolled"],
  STATUS_MFA_LOGIN_SUCCEEDED: ["info", "A Status administrator completed MFA sign-in"],
  STATUS_MFA_RECOVERY_CODE_USED: ["warning", "A one-use Status MFA recovery code was used"],
  STATUS_MFA_LOGIN_FAILED: ["warning", "A Status MFA sign-in attempt failed"],
  STATUS_MFA_LOGIN_RATE_LIMITED: ["warning", "Status MFA sign-in attempts were rate limited"],
  STATUS_REAUTH_SUCCEEDED: ["info", "A sensitive Status action was reauthenticated"],
  STATUS_REAUTH_FAILED: ["warning", "A sensitive Status action failed reauthentication"],
  STATUS_REAUTH_RATE_LIMITED: ["warning", "Sensitive Status actions were rate limited"],
  STATUS_ADMIN_CREATED: ["info", "A Status administrator invitation was created"],
  STATUS_ADMIN_ACTIVATION_ISSUED: ["warning", "A Status administrator activation was issued"],
  STATUS_ADMIN_ACTIVATED: ["info", "A Status administrator was activated"],
  STATUS_ADMIN_RECOVERY_ISSUED: ["warning", "A Status administrator recovery was issued"],
  STATUS_ADMIN_RECOVERED: ["warning", "A Status administrator completed recovery"],
  STATUS_ADMIN_SUSPENDED: ["warning", "A Status administrator was suspended"],
} as const

export const STATUS_SECURITY_EVENT_CODES = Object.freeze(Object.keys(SECURITY_EVENTS))

type SecurityEventCode = keyof typeof SECURITY_EVENTS

export class AuthService {
  constructor(
    private readonly db: StatusDatabase,
    private readonly rateLimitKey: Buffer,
    private readonly bcryptCost = 12,
    private readonly now: () => number = Date.now,
    private readonly comparePassword: (password: string, hash: string) => Promise<boolean> = bcrypt.compare,
    private readonly mfaEncryptionKey: Buffer = rateLimitKey,
  ) {}

  async initialize(
    emailInput: string,
    password: string,
    generation = 1,
  ): Promise<{ generation: number; idempotent: boolean }> {
    const email = this.validateCredentials(emailInput, password)
    if (!Number.isInteger(generation) || generation < 1 || generation > 1_000_000) {
      throw new AuthError("INVALID_INPUT", "Credential generation must be a positive integer")
    }
    const existing = this.db.getAuth()
    if (existing) {
      if (existing.generation === generation && existing.email === email
        && await bcrypt.compare(password, existing.password_hash)) {
        return { generation, idempotent: true }
      }
      throw new AuthError("ALREADY_INITIALIZED", "Appliance operator is already initialized")
    }
    const passwordHash = await bcrypt.hash(password, this.bcryptCost)
    try {
      this.db.initializeAuth(email, passwordHash, generation, this.now())
    } catch {
      throw new AuthError("ALREADY_INITIALIZED", "Appliance operator is already initialized")
    }
    this.recordSecurityEvent("STATUS_AUTH_INITIALIZED")
    return { generation, idempotent: false }
  }

  async prepare(input: {
    email: string
    password: string
    expectedGeneration?: number
  }): Promise<{ transactionId: string; pendingGeneration: number; idempotent: boolean }> {
    const email = this.validateCredentials(input.email, input.password)
    const auth = this.db.getAuth()
    if (!auth) throw new AuthError("NOT_INITIALIZED", "Appliance operator is not initialized")
    const expected = input.expectedGeneration ?? auth.generation
    if (expected !== auth.generation) {
      throw new AuthError("GENERATION_MISMATCH", "Credential generation does not match")
    }
    const now = this.now()
    if (auth.pending_transaction_id && auth.pending_expires_at && auth.pending_expires_at > now) {
      const samePending = auth.pending_email === email
        && Boolean(auth.pending_password_hash)
        && await bcrypt.compare(input.password, auth.pending_password_hash!)
      if (samePending && auth.pending_generation === auth.generation + 1) {
        return {
          transactionId: auth.pending_transaction_id,
          pendingGeneration: auth.pending_generation,
          idempotent: true,
        }
      }
      throw new AuthError("PENDING_CHANGE", "A different credential change is already pending")
    }

    const transactionId = randomUUID()
    const pendingGeneration = auth.generation + 1
    const passwordHash = await bcrypt.hash(input.password, this.bcryptCost)
    this.db.setPendingAuth(
      email,
      passwordHash,
      pendingGeneration,
      transactionId,
      now + 24 * 60 * 60_000,
      now,
    )
    this.recordSecurityEvent("STATUS_AUTH_CHANGE_PREPARED")
    return { transactionId, pendingGeneration, idempotent: false }
  }

  commit(transactionId: string): { generation: number } {
    if (!/^[0-9a-f-]{36}$/i.test(transactionId)) {
      throw new AuthError("INVALID_INPUT", "A valid transaction ID is required")
    }
    try {
      const result = { generation: this.db.commitPendingAuth(transactionId, this.now()) }
      this.recordSecurityEvent("STATUS_AUTH_CHANGED")
      return result
    } catch {
      throw new AuthError("PENDING_CHANGE", "No matching pending credential change")
    }
  }

  abort(transactionId: string): { aborted: true } {
    if (!/^[0-9a-f-]{36}$/i.test(transactionId)) {
      throw new AuthError("INVALID_INPUT", "A valid transaction ID is required")
    }
    try {
      this.db.abortPendingAuth(transactionId, this.now())
    } catch {
      throw new AuthError("PENDING_CHANGE", "No matching pending credential change")
    }
    this.recordSecurityEvent("STATUS_AUTH_CHANGE_ABORTED")
    return { aborted: true }
  }

  state(): {
    initialized: boolean
    generation?: number
    operatorEmailHash?: string
    pending?: { transactionId: string; generation: number; operatorEmailHash: string; expiresAt: string }
  } {
    const auth = this.db.getAuth()
    if (!auth) return { initialized: false }
    const state: ReturnType<AuthService["state"]> = {
      initialized: true,
      generation: auth.generation,
      operatorEmailHash: sha256(normalizeEmail(auth.email)),
    }
    if (auth.pending_transaction_id && auth.pending_generation && auth.pending_email
      && auth.pending_expires_at && auth.pending_expires_at > this.now()) {
      state.pending = {
        transactionId: auth.pending_transaction_id,
        generation: auth.pending_generation,
        operatorEmailHash: sha256(normalizeEmail(auth.pending_email)),
        expiresAt: new Date(auth.pending_expires_at).toISOString(),
      }
    }
    return state
  }

  createRecoveryToken(ttlMinutes = 15): { token: string; expiresAt: string } {
    if (!this.db.getAuth()) throw new AuthError("NOT_INITIALIZED", "Appliance operator is not initialized")
    if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 60) {
      throw new AuthError("INVALID_INPUT", "Recovery token lifetime must be from 1 to 60 minutes")
    }
    const token = randomToken(32)
    const expiresAt = this.now() + ttlMinutes * 60_000
    this.db.createStatusAdminConsoleRecoveryToken(sha256(token), expiresAt)
    this.recordSecurityEvent("STATUS_RECOVERY_TOKEN_ISSUED")
    return { token, expiresAt: new Date(expiresAt).toISOString() }
  }

  statusSessionPrincipal(sessionToken: string | undefined): StatusSessionPrincipal | null {
    if (!sessionToken || sessionToken.length < 32 || sessionToken.length > 256) return null
    return this.db.statusAdminSessionPrincipal(sha256(sessionToken), this.now())
  }

  listStatusAdmins(): StatusAdminSummary[] {
    return this.db.listStatusAdmins(this.now())
  }

  async createStatusAdmin(input: {
    sessionToken: string | undefined
    currentPassword: string
    email: string
    displayName: string
    reason: string
  }): Promise<StatusAdminOneTimeToken> {
    await this.reauthenticatePassword(input.sessionToken, input.currentPassword)
    const actor = this.requirePasswordPrincipal(input.sessionToken)
    const email = normalizeEmail(input.email)
    const displayName = input.displayName.normalize("NFC").trim()
    const reason = this.validateReason(input.reason)
    if (!validEmail(email) || displayName.length < 1 || displayName.length > 160
      || /[\p{Cc}\p{Cf}]/u.test(displayName)) {
      throw new AuthError("INVALID_INPUT", "Provide a valid administrator name and email")
    }
    const token = randomToken(32)
    const now = this.now()
    const expiresAt = now + 72 * 60 * 60_000
    try {
      this.db.createPendingStatusAdmin({
        id: randomUUID(),
        email,
        emailCanonical: email,
        displayName,
        tokenHash: sha256(token),
        expiresAt,
        actorAdminId: actor.adminId,
        reason,
        now,
      })
    } catch (error) {
      throw this.statusAdminError(error)
    }
    this.recordSecurityEvent("STATUS_ADMIN_CREATED")
    return { purpose: "ACTIVATION", token, expiresAt: new Date(expiresAt).toISOString() }
  }

  async issueStatusAdminLink(input: {
    sessionToken: string | undefined
    currentPassword: string
    targetAdminId: string
    purpose: StatusAdminLinkPurpose
    reason: string
  }): Promise<StatusAdminOneTimeToken> {
    await this.reauthenticatePassword(input.sessionToken, input.currentPassword)
    const actor = this.requirePasswordPrincipal(input.sessionToken)
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.targetAdminId)) {
      throw new AuthError("INVALID_INPUT", "A valid Status administrator is required")
    }
    const reason = this.validateReason(input.reason)
    const token = randomToken(32)
    const now = this.now()
    const expiresAt = now + (input.purpose === "ACTIVATION" ? 72 : 8) * 60 * 60_000
    try {
      this.db.issueStatusAdminLink({
        targetAdminId: input.targetAdminId,
        purpose: input.purpose,
        tokenHash: sha256(token),
        expiresAt,
        actorAdminId: actor.adminId,
        reason,
        now,
      })
    } catch (error) {
      throw this.statusAdminError(error)
    }
    this.recordSecurityEvent(input.purpose === "ACTIVATION"
      ? "STATUS_ADMIN_ACTIVATION_ISSUED"
      : "STATUS_ADMIN_RECOVERY_ISSUED")
    return { purpose: input.purpose, token, expiresAt: new Date(expiresAt).toISOString() }
  }

  async redeemStatusAdminLink(input: {
    token: string
    purpose: StatusAdminLinkPurpose
    password: string
  }): Promise<{ email: string }> {
    if (input.token.length < 32 || input.token.length > 256 || !validPassword(input.password)) {
      throw new AuthError("INVALID_INPUT", "The one-time token or password is invalid")
    }
    const passwordHash = await bcrypt.hash(input.password, this.bcryptCost)
    let result: { adminId: string; email: string }
    try {
      result = this.db.redeemStatusAdminLink({
        tokenHash: sha256(input.token),
        purpose: input.purpose,
        passwordHash,
        now: this.now(),
      })
    } catch (error) {
      throw this.statusAdminError(error)
    }
    this.recordSecurityEvent(input.purpose === "ACTIVATION"
      ? "STATUS_ADMIN_ACTIVATED"
      : "STATUS_ADMIN_RECOVERED")
    return { email: result.email }
  }

  async suspendStatusAdmin(input: {
    sessionToken: string | undefined
    currentPassword: string
    targetAdminId: string
    reason: string
  }): Promise<void> {
    await this.reauthenticatePassword(input.sessionToken, input.currentPassword)
    const actor = this.requirePasswordPrincipal(input.sessionToken)
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.targetAdminId)) {
      throw new AuthError("INVALID_INPUT", "A valid Status administrator is required")
    }
    try {
      this.db.suspendStatusAdmin({
        targetAdminId: input.targetAdminId,
        actorAdminId: actor.adminId,
        reason: this.validateReason(input.reason),
        now: this.now(),
      })
    } catch (error) {
      throw this.statusAdminError(error)
    }
    this.recordSecurityEvent("STATUS_ADMIN_SUSPENDED")
  }

  async beginPasswordLogin(input: {
    email: string
    password: string
    clientAddress: string
  }): Promise<MfaLoginChallenge> {
    const email = normalizeEmail(input.email)
    const now = this.now()
    const attemptId = randomUUID()
    if (!this.db.reserveLoginAttempt(attemptId, this.loginRateKeys(input.clientAddress, email), now)) {
      this.recordSecurityEvent("STATUS_LOGIN_RATE_LIMITED")
      throw new AuthError("RATE_LIMITED", "Too many attempts; wait before trying again")
    }
    const auth = this.db.getAuth()
    if (!auth) throw new AuthError("NOT_INITIALIZED", "Appliance operator is not initialized")
    const passwordMatch = await this.matchPassword(email, input.password, now)
    if (!passwordMatch) {
      this.recordSecurityEvent("STATUS_LOGIN_FAILED")
      throw new AuthError("INVALID_CREDENTIALS", "The credentials were not accepted")
    }

    const targetGeneration = passwordMatch.kind === "pending"
      ? passwordMatch.generation + 1
      : passwordMatch.generation
    const secret = generateTotpSecret()
    const challengeToken = randomToken(32)
    const expiresAt = now + 5 * 60_000
    const created = this.db.createStatusAdminMfaChallenge({
      tokenHash: sha256(challengeToken),
      attemptId,
      match: passwordMatch,
      enrollmentSecretCiphertext: encryptTotpSecret(secret, this.mfaEncryptionKey, targetGeneration),
      now,
      expiresAt,
    })
    if (!created) {
      this.recordSecurityEvent("STATUS_LOGIN_FAILED")
      throw new AuthError("INVALID_CREDENTIALS", "The credentials were not accepted")
    }
    this.recordSecurityEvent("STATUS_MFA_CHALLENGE_ISSUED")
    return {
      challengeToken,
      expiresAt: new Date(expiresAt).toISOString(),
      enrollmentRequired: created.enrollmentRequired,
      ...(created.enrollmentRequired ? {
        manualKey: secret,
        otpauthUri: totpUri(passwordMatch.email, secret),
      } : {}),
    }
  }

  describeMfaChallenge(challengeToken: string): MfaLoginChallenge {
    const material = this.challengeMaterial(challengeToken)
    const secret = decryptTotpSecret(
      material.secretCiphertext,
      this.mfaEncryptionKey,
      material.targetGeneration,
    )
    return {
      challengeToken,
      expiresAt: new Date(material.expiresAt).toISOString(),
      enrollmentRequired: material.enrollmentRequired,
      ...(material.enrollmentRequired ? {
        manualKey: secret,
        otpauthUri: totpUri(material.email, secret),
      } : {}),
    }
  }

  completeMfaLogin(input: {
    challengeToken: string
    code: string
    clientAddress: string
  }): MfaLoginResult {
    const now = this.now()
    const challengeHash = sha256(input.challengeToken)
    const attemptId = randomUUID()
    const rateIdentity = `mfa:${challengeHash}`
    if (!this.db.reserveLoginAttempt(
      attemptId,
      this.loginRateKeys(input.clientAddress, rateIdentity),
      now,
    )) {
      this.recordSecurityEvent("STATUS_MFA_LOGIN_RATE_LIMITED")
      throw new AuthError("RATE_LIMITED", "Too many MFA attempts; wait before trying again")
    }
    const material = this.challengeMaterial(input.challengeToken)
    let secret: string
    try {
      secret = decryptTotpSecret(
        material.secretCiphertext,
        this.mfaEncryptionKey,
        material.targetGeneration,
      )
    } catch {
      this.recordSecurityEvent("STATUS_MFA_LOGIN_FAILED")
      throw new AuthError("MFA_CHALLENGE_INVALID", "The MFA challenge is unavailable")
    }
    const totpStep = matchingTotpStep(secret, input.code.trim(), now)
    const suppliedRecoveryHash = material.enrollmentRequired
      ? null
      : recoveryCodeHash(material.targetGeneration, material.email, input.code)
    if (totpStep === null && !suppliedRecoveryHash) {
      this.recordSecurityEvent("STATUS_MFA_LOGIN_FAILED")
      throw new AuthError("INVALID_CREDENTIALS", "The verification code was not accepted")
    }

    const recoveryCodes = material.enrollmentRequired ? generateRecoveryCodes() : undefined
    const sessionToken = randomToken(32)
    const completed = this.db.completeStatusAdminMfaSession({
      challengeHash,
      sessionHash: sha256(sessionToken),
      attemptId,
      now,
      ...(totpStep === null ? { recoveryCodeHash: suppliedRecoveryHash! } : { totpStep }),
      ...(recoveryCodes ? {
        enrollmentRecoveryCodeHashes: recoveryCodes.map(code => recoveryCodeHash(
          material.targetGeneration,
          material.email,
          code,
        )!),
      } : {}),
    })
    if (!completed) {
      this.recordSecurityEvent("STATUS_MFA_LOGIN_FAILED")
      throw new AuthError("INVALID_CREDENTIALS", "The verification code was not accepted")
    }
    this.recordSecurityEvent(material.enrollmentRequired
      ? "STATUS_MFA_ENROLLED"
      : totpStep === null
        ? "STATUS_MFA_RECOVERY_CODE_USED"
        : "STATUS_MFA_LOGIN_SUCCEEDED")
    return { sessionToken, kind: "password", ...(recoveryCodes ? { recoveryCodes } : {}) }
  }

  async loginWithRecoveryToken(input: {
    recoveryToken: string
    clientAddress: string
  }): Promise<LoginResult> {
    const now = this.now()
    const attemptId = randomUUID()
    if (!this.db.reserveLoginAttempt(
      attemptId,
      this.loginRateKeys(input.clientAddress, "console-recovery"),
      now,
    )) {
      this.recordSecurityEvent("STATUS_LOGIN_RATE_LIMITED")
      throw new AuthError("RATE_LIMITED", "Too many attempts; wait before trying again")
    }
    if (!this.db.getAuth()) throw new AuthError("NOT_INITIALIZED", "Appliance operator is not initialized")
    const sessionToken = randomToken(32)
    const accepted = input.recoveryToken.length >= 32 && input.recoveryToken.length <= 256
      && this.db.createStatusAdminConsoleRecoverySession(
        sha256(sessionToken),
        attemptId,
        sha256(input.recoveryToken),
        now,
      )
    if (!accepted) {
      this.recordSecurityEvent("STATUS_LOGIN_FAILED")
      throw new AuthError("INVALID_CREDENTIALS", "The credentials were not accepted")
    }
    this.recordSecurityEvent("STATUS_RECOVERY_LOGIN_SUCCEEDED")
    return { sessionToken, kind: "recovery" }
  }

  validateSession(sessionToken: string | undefined): boolean {
    return Boolean(sessionToken)
      && sessionToken!.length >= 32
      && sessionToken!.length <= 256
      && Boolean(this.db.statusAdminSessionPrincipal(sha256(sessionToken!), this.now()))
  }

  /**
   * How this session signed in, or null if it is not a session at all.
   *
   * Used to keep a recovery session away from anything that restarts the
   * clinical stack. It blocks nothing legitimate: anyone who can issue a
   * recovery token already has console access, and can update from there.
   */
  validateSessionKind(sessionToken: string | undefined): "password" | "recovery" | null {
    if (!sessionToken || sessionToken.length < 32 || sessionToken.length > 256) return null
    return this.db.statusAdminSessionPrincipal(sha256(sessionToken), this.now())?.kind ?? null
  }

  async reauthenticatePassword(sessionToken: string | undefined, password: string): Promise<void> {
    if (!sessionToken || sessionToken.length < 32 || sessionToken.length > 256
      || password.length < 1 || password.length > 256) {
      this.recordSecurityEvent("STATUS_REAUTH_FAILED")
      throw new AuthError("INVALID_CREDENTIALS", "Password reauthentication failed")
    }
    const sessionHash = sha256(sessionToken)
    const principal = this.db.statusAdminSessionPrincipal(sessionHash, this.now())
    if (!principal || principal.kind !== "password") {
      this.recordSecurityEvent("STATUS_REAUTH_FAILED")
      throw new AuthError("INVALID_CREDENTIALS", "Password reauthentication failed")
    }
    const attemptId = randomUUID()
    if (!this.db.reserveStatusAdminReauthAttempt(
      attemptId,
      principal.adminId,
      sessionHash,
      this.now(),
    )) {
      this.recordSecurityEvent("STATUS_REAUTH_RATE_LIMITED")
      throw new AuthError("RATE_LIMITED", "Too many sensitive-action attempts")
    }
    const current = this.db.getStatusAdminCredential(principal.adminId)
    const valid = Boolean(current) && await this.comparePassword(password, current!.passwordHash)
    this.db.completeStatusAdminReauthAttempt(
      attemptId,
      principal.adminId,
      sessionHash,
      valid,
    )
    if (!valid) {
      this.recordSecurityEvent("STATUS_REAUTH_FAILED")
      throw new AuthError("INVALID_CREDENTIALS", "Password reauthentication failed")
    }
    this.recordSecurityEvent("STATUS_REAUTH_SUCCEEDED")
  }

  logout(sessionToken: string | undefined): void {
    if (sessionToken && sessionToken.length >= 32 && sessionToken.length <= 256) {
      this.db.deleteStatusAdminSession(sha256(sessionToken))
    }
  }

  private loginRateKeys(clientAddress: string, identity: string): string[] {
    return [
      hmacSha256(this.rateLimitKey, `${clientAddress}\u0000${identity}`),
      hmacSha256(this.rateLimitKey, `${clientAddress}\u0000all-identities`),
      hmacSha256(this.rateLimitKey, `all-addresses\u0000${identity}`),
    ]
  }

  private async matchPassword(
    email: string,
    password: string,
    now: number,
  ): Promise<PasswordCredentialMatch | null> {
    if (password.length < 1 || password.length > 256) return null
    const auth = this.db.findStatusAdminForLogin(email, now)
    if (!auth) return null
    if (email === normalizeEmail(auth.email)
      && await this.comparePassword(password, auth.passwordHash)) {
      return {
        kind: "current",
        adminId: auth.id,
        email: auth.email,
        passwordHash: auth.passwordHash,
        generation: auth.generation,
      }
    }
    const pendingEligible = auth.pendingEmail !== null
      && normalizeEmail(auth.pendingEmail) === email
      && Boolean(auth.pendingPasswordHash)
      && Boolean(auth.pendingTransactionId)
      && Boolean(auth.pendingExpiresAt && auth.pendingExpiresAt > now)
    if (pendingEligible && await this.comparePassword(password, auth.pendingPasswordHash!)) {
      return {
        kind: "pending",
        adminId: auth.id,
        email: auth.pendingEmail!,
        passwordHash: auth.pendingPasswordHash!,
        generation: auth.generation,
        transactionId: auth.pendingTransactionId!,
      }
    }
    return null
  }

  private challengeMaterial(challengeToken: string): AdminMfaChallengeMaterial {
    if (challengeToken.length < 32 || challengeToken.length > 256) {
      throw new AuthError("MFA_CHALLENGE_INVALID", "The MFA challenge is invalid or expired")
    }
    const material = this.db.getStatusAdminMfaChallengeMaterial(sha256(challengeToken), this.now())
    if (!material) {
      throw new AuthError("MFA_CHALLENGE_INVALID", "The MFA challenge is invalid or expired")
    }
    return material
  }

  private requirePasswordPrincipal(sessionToken: string | undefined): StatusSessionPrincipal {
    const principal = this.statusSessionPrincipal(sessionToken)
    if (!principal || principal.kind !== "password") {
      throw new AuthError("INVALID_CREDENTIALS", "A password and MFA session is required")
    }
    return principal
  }

  private validateReason(value: string): string {
    const reason = value.normalize("NFC").trim()
    if (reason.length < 10 || reason.length > 1_000 || /\p{Cc}/u.test(reason)) {
      throw new AuthError("INVALID_INPUT", "Provide a reason from 10 to 1000 characters")
    }
    return reason
  }

  private statusAdminError(error: unknown): AuthError {
    if (!(error instanceof StatusAdminStoreError)) {
      return new AuthError("ADMIN_STATE_INVALID", "The Status administrator operation failed")
    }
    if (error.code === "INVALID_ACTOR") {
      return new AuthError("INVALID_CREDENTIALS", "The acting administrator is unavailable")
    }
    return new AuthError(error.code, error.message)
  }

  private validateCredentials(emailInput: string, password: string): string {
    const email = normalizeEmail(emailInput)
    if (!validEmail(email) || !validPassword(password)) {
      throw new AuthError(
        "INVALID_INPUT",
        "Provide a valid email and an 8–256 character password with an uppercase letter, number, and special character",
      )
    }
    return email
  }

  private recordSecurityEvent(code: SecurityEventCode): void {
    const [severity, message] = SECURITY_EVENTS[code]
    this.db.insertEvent({
      id: randomUUID(),
      producer: "status-auth",
      occurredAt: this.now(),
      code,
      severity,
      message,
      facts: {},
    })
  }
}
