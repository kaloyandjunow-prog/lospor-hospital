type PublicErrorKey =
  | "auth.clinicalAppForbidden"
  | "auth.emailNotVerified"
  | "auth.accountDisabled"
  | "auth.registrationDisabled"
  | "auth.emailRegistered"
  | "auth.rateLimited"
  | "auth.invalidCredentials"
  | "auth.registrationFailed"
  | "auth.legalDocumentsUnavailable"
  | "auth.passwordResetFailed"

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function apiErrorCode(value: unknown): string | undefined {
  const body = record(value)
  const nested = record(body.error)
  const candidate = body.code ?? body.errorCode ?? nested.code
  return typeof candidate === "string" ? candidate : undefined
}

const AUTH_KEYS: Record<string, PublicErrorKey> = {
  CLINICAL_APP_FORBIDDEN: "auth.clinicalAppForbidden",
  EMAIL_NOT_VERIFIED: "auth.emailNotVerified",
  ACCOUNT_DISABLED: "auth.accountDisabled",
  ACCOUNT_DELETED: "auth.accountDisabled",
  REGISTRATION_DISABLED: "auth.registrationDisabled",
  EMAIL_ALREADY_REGISTERED: "auth.emailRegistered",
  RATE_LIMITED: "auth.rateLimited",
  TOO_MANY_REQUESTS: "auth.rateLimited",
  INVALID_CREDENTIALS: "auth.invalidCredentials",
  LEGAL_ACCEPTANCE_REQUIRED: "auth.legalDocumentsUnavailable",
  LEGAL_ACCEPTANCE_MISMATCH: "auth.legalDocumentsUnavailable",
  LEGAL_DOCUMENTS_UNAVAILABLE: "auth.legalDocumentsUnavailable",
  LEGAL_LOCALE_MISMATCH: "auth.legalDocumentsUnavailable",
}

export function loginErrorKey(status: number, body: unknown): PublicErrorKey {
  const code = apiErrorCode(body)
  if (code && AUTH_KEYS[code]) return AUTH_KEYS[code]
  if (status === 429) return "auth.rateLimited"
  return "auth.invalidCredentials"
}

export function registrationErrorKey(status: number, body: unknown): PublicErrorKey {
  const code = apiErrorCode(body)
  if (code && AUTH_KEYS[code]) return AUTH_KEYS[code]
  if (status === 409) return "auth.emailRegistered"
  if (status === 429) return "auth.rateLimited"
  return "auth.registrationFailed"
}

export function passwordResetErrorKey(status: number, body: unknown): PublicErrorKey {
  const code = apiErrorCode(body)
  if (code && AUTH_KEYS[code]) return AUTH_KEYS[code]
  if (status === 429) return "auth.rateLimited"
  return "auth.passwordResetFailed"
}
