export type AdministratorMfaChallenge = {
  code: "MFA_REQUIRED" | "MFA_ENROLLMENT_REQUIRED"
  challengeToken: string
  expiresIn: number
  expiresAt: number
  enrollmentRequired: boolean
  manualKey?: string
  otpauthUri?: string
}

export type AdministratorMfaCompletion = {
  accessToken?: string
  recoveryCodes?: string[]
}

export type LoginResult =
  | { kind: "authenticated" }
  | { kind: "mfa"; challenge: AdministratorMfaChallenge }

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function safeOtpAuthUri(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined
  try {
    const parsed = new URL(value)
    if (
      parsed.protocol !== "otpauth:"
      || parsed.hostname !== "totp"
      || parsed.username
      || parsed.password
      || parsed.port
      || !/^[A-Z2-7]{16,128}$/.test(parsed.searchParams.get("secret") ?? "")
    ) return undefined
    return value
  } catch {
    return undefined
  }
}

export function parseAdministratorMfaChallenge(
  value: unknown,
  nowMs = Date.now(),
): AdministratorMfaChallenge | null {
  const body = record(value)
  const mfa = record(body?.mfa)
  const code = body?.code
  if (
    !mfa
    || (code !== "MFA_REQUIRED" && code !== "MFA_ENROLLMENT_REQUIRED")
    || (mfa.code !== undefined && mfa.code !== code)
    || typeof mfa.challengeToken !== "string"
    || mfa.challengeToken.length < 32
    || mfa.challengeToken.length > 256
    || !Number.isSafeInteger(mfa.expiresIn)
    || (mfa.expiresIn as number) < 1
    || (mfa.expiresIn as number) > 24 * 60 * 60
    || typeof mfa.enrollmentRequired !== "boolean"
    || mfa.enrollmentRequired !== (code === "MFA_ENROLLMENT_REQUIRED")
  ) return null

  const manualKey = typeof mfa.manualKey === "string"
    && /^[A-Z2-7]{16,128}$/.test(mfa.manualKey)
    ? mfa.manualKey
    : undefined
  const otpauthUri = safeOtpAuthUri(mfa.otpauthUri)
  if (mfa.enrollmentRequired && !manualKey && !otpauthUri) return null

  const expiresIn = mfa.expiresIn as number
  return {
    code,
    challengeToken: mfa.challengeToken,
    expiresIn,
    expiresAt: nowMs + expiresIn * 1000,
    enrollmentRequired: mfa.enrollmentRequired,
    ...(manualKey ? { manualKey } : {}),
    ...(otpauthUri ? { otpauthUri } : {}),
  }
}

function validRecoveryCode(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 6
    && value.length <= 64
    && /^[\x21-\x7e]+$/.test(value)
}

export function parseAdministratorMfaCompletion(
  value: unknown,
  client: "PWA" | "NATIVE",
  enrollmentRequired: boolean,
): AdministratorMfaCompletion | null {
  const body = record(value)
  if (!body) return null

  let accessToken: string | undefined
  if (client === "PWA") {
    const user = record(body.user)
    if (!user || typeof user.id !== "string" || !user.id) return null
  } else {
    if (
      typeof body.access_token !== "string"
      || !body.access_token
      || body.token_type !== "Bearer"
      || !Number.isSafeInteger(body.expires_in)
      || (body.expires_in as number) < 1
    ) return null
    accessToken = body.access_token
  }

  if (!enrollmentRequired) {
    if (Object.hasOwn(body, "recoveryCodes")) return null
    return { ...(accessToken ? { accessToken } : {}) }
  }

  if (
    !Array.isArray(body.recoveryCodes)
    || body.recoveryCodes.length !== 10
    || !body.recoveryCodes.every(validRecoveryCode)
    || new Set(body.recoveryCodes).size !== 10
  ) return null

  return {
    ...(accessToken ? { accessToken } : {}),
    recoveryCodes: [...body.recoveryCodes],
  }
}

export function administratorMfaErrorKey(status: number):
  | "mfaRateLimited"
  | "mfaChallengeEnded"
  | "mfaInvalidOrExpired"
  | "mfaUnavailable" {
  if (status === 429) return "mfaRateLimited"
  if (status === 409) return "mfaChallengeEnded"
  if (status === 401) return "mfaInvalidOrExpired"
  return "mfaUnavailable"
}
