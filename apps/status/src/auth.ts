import bcrypt from "bcryptjs"
import { randomUUID } from "node:crypto"
import type { StatusDatabase } from "./db.js"
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
      | "GENERATION_MISMATCH" | "PENDING_CHANGE" | "INVALID_CREDENTIALS" | "RATE_LIMITED",
    message: string,
  ) {
    super(message)
  }
}

export type LoginResult = {
  sessionToken: string
  kind: "password" | "recovery"
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
} as const

type SecurityEventCode = keyof typeof SECURITY_EVENTS

export class AuthService {
  constructor(
    private readonly db: StatusDatabase,
    private readonly rateLimitKey: Buffer,
    private readonly bcryptCost = 12,
    private readonly now: () => number = Date.now,
    private readonly comparePassword: (password: string, hash: string) => Promise<boolean> = bcrypt.compare,
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
    this.db.createRecoveryToken(sha256(token), expiresAt)
    this.recordSecurityEvent("STATUS_RECOVERY_TOKEN_ISSUED")
    return { token, expiresAt: new Date(expiresAt).toISOString() }
  }

  async login(input: {
    email?: string
    password?: string
    recoveryToken?: string
    clientAddress: string
  }): Promise<LoginResult> {
    const email = normalizeEmail(input.email ?? "")
    const rateIdentity = input.recoveryToken ? "recovery" : email
    const rateKeys = [
      hmacSha256(this.rateLimitKey, `${input.clientAddress}\u0000${rateIdentity}`),
      hmacSha256(this.rateLimitKey, `${input.clientAddress}\u0000all-identities`),
      hmacSha256(this.rateLimitKey, `all-addresses\u0000${rateIdentity}`),
    ]
    const now = this.now()
    const attemptId = randomUUID()
    if (!this.db.reserveLoginAttempt(attemptId, rateKeys, now)) {
      this.recordSecurityEvent("STATUS_LOGIN_RATE_LIMITED")
      throw new AuthError("RATE_LIMITED", "Too many attempts; wait before trying again")
    }

    const auth = this.db.getAuth()
    if (!auth) throw new AuthError("NOT_INITIALIZED", "Appliance operator is not initialized")
    let kind: "password" | "recovery" | null = null
    let passwordMatch: {
      kind: "current" | "pending"
      email: string
      passwordHash: string
      generation: number
      transactionId?: string
    } | null = null
    if (input.recoveryToken && input.recoveryToken.length >= 32 && input.recoveryToken.length <= 256) {
      kind = "recovery"
    } else if (input.password && input.password.length <= 256) {
      const currentMatches = email === auth.email && await this.comparePassword(input.password, auth.password_hash)
      const pendingMatches = Boolean(
        auth.pending_email === email
        && auth.pending_password_hash
        && auth.pending_expires_at
        && auth.pending_expires_at > now,
      ) && await this.comparePassword(input.password, auth.pending_password_hash!)
      if (currentMatches) {
        kind = "password"
        passwordMatch = {
          kind: "current",
          email: auth.email,
          passwordHash: auth.password_hash,
          generation: auth.generation,
        }
      } else if (pendingMatches) {
        kind = "password"
        passwordMatch = {
          kind: "pending",
          email: auth.pending_email!,
          passwordHash: auth.pending_password_hash!,
          generation: auth.generation,
          transactionId: auth.pending_transaction_id!,
        }
      }
    }

    const sessionToken = randomToken(32)
    const sessionCreated = kind === "password" && passwordMatch
      ? this.db.createPasswordSession(sha256(sessionToken), attemptId, passwordMatch, now)
      : kind === "recovery" && input.recoveryToken
        ? this.db.createRecoverySession(sha256(sessionToken), attemptId, sha256(input.recoveryToken), now)
        : false
    if (!kind || !sessionCreated) {
      this.recordSecurityEvent("STATUS_LOGIN_FAILED")
      throw new AuthError("INVALID_CREDENTIALS", "The credentials were not accepted")
    }
    this.recordSecurityEvent(kind === "recovery"
      ? "STATUS_RECOVERY_LOGIN_SUCCEEDED"
      : "STATUS_LOGIN_SUCCEEDED")
    return { sessionToken, kind }
  }

  validateSession(sessionToken: string | undefined): boolean {
    return Boolean(sessionToken)
      && sessionToken!.length >= 32
      && sessionToken!.length <= 256
      && this.db.validateSession(sha256(sessionToken!), this.now())
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
    return this.db.sessionKind(sha256(sessionToken), this.now())
  }

  logout(sessionToken: string | undefined): void {
    if (sessionToken && sessionToken.length >= 32 && sessionToken.length <= 256) {
      this.db.deleteSession(sha256(sessionToken))
    }
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
