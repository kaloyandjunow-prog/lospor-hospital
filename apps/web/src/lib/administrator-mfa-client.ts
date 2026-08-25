export type AdministratorMfaChallenge = {
  code: "MFA_REQUIRED" | "MFA_ENROLLMENT_REQUIRED"
  challengeToken: string
  expiresIn: number
  expiresAt: number
  enrollmentRequired: boolean
  manualKey?: string
  otpauthUri?: string
}

export type AdministratorMfaSuccess = {
  user: Record<string, unknown>
  recoveryCodes?: string[]
}

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

export function parseAdministratorMfaSuccess(
  value: unknown,
  enrollmentRequired: boolean,
): AdministratorMfaSuccess | null {
  const body = record(value)
  const user = record(body?.user)
  if (!body || !user) return null

  if (!enrollmentRequired) {
    if (Object.hasOwn(body, "recoveryCodes")) return null
    return { user }
  }

  if (
    !Array.isArray(body.recoveryCodes)
    || body.recoveryCodes.length !== 10
    || !body.recoveryCodes.every(validRecoveryCode)
    || new Set(body.recoveryCodes).size !== 10
  ) return null

  return { user, recoveryCodes: [...body.recoveryCodes] }
}

export function administratorMfaErrorKey(status: number): string {
  if (status === 429) return "mfa.rateLimited"
  if (status === 409) return "mfa.challengeEnded"
  if (status === 401) return "mfa.invalidOrExpired"
  return "mfa.unavailable"
}
