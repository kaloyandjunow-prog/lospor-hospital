/** @deprecated Legal versions are deployment manifest data, not package constants. */
export const CURRENT_TERMS_VERSION = "4.0"

export const ACCOUNT_KINDS = ["CLINICAL", "RESEARCH_ONLY"] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]
export const DEFAULT_ACCOUNT_KIND: AccountKind = "CLINICAL"

/**
 * Stored at `User.preferences.ui.locale`.
 *
 * The pre-auth device/cookie locale is deliberately separate: it can select a
 * login language before an account is known, but after login this preference
 * is the one shared by every first-party client.
 */
export const PREFERRED_LOCALES = ["bg", "en"] as const
export type PreferredLocale = (typeof PREFERRED_LOCALES)[number]
export const DEFAULT_PREFERRED_LOCALE: PreferredLocale = "bg"

export type AccountPreferences = Record<string, unknown> & {
  ui?: Record<string, unknown> & {
    locale?: PreferredLocale
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function normalizePreferredLocale(value: unknown): PreferredLocale {
  return value === "en" || value === "EN" ? "en" : DEFAULT_PREFERRED_LOCALE
}

export function preferredLocaleFromPreferences(preferences: unknown): PreferredLocale {
  const ui = record(record(preferences).ui)
  return normalizePreferredLocale(ui.locale)
}

/** Preserve unrelated preferences while changing the one canonical UI key. */
export function preferencesWithPreferredLocale(
  preferences: unknown,
  locale: PreferredLocale,
): AccountPreferences {
  const current = record(preferences)
  const ui = record(current.ui)
  return {
    ...current,
    ui: {
      ...ui,
      locale,
    },
  }
}

/**
 * The institution that means "none".
 *
 * Every account belongs to an institution — a NULL used to mean the same thing
 * but could not be shown, chosen at registration, or reasoned about. This is a
 * fixed, readable id rather than a generated one precisely so all three clients
 * and the API can name it without a lookup.
 *
 * It has members but no head of department: there is no department to head. So
 * cases recorded while here stay with the clinician who wrote them and with
 * administrators, which is exactly what a NULL institution used to give.
 */
export const NO_INSTITUTION_ID = "no-institution"

/** Whether an institution can have a head of department. See NO_INSTITUTION_ID. */
export function canHaveHeadOfDepartment(institutionId: string | null | undefined): boolean {
  return Boolean(institutionId) && institutionId !== NO_INSTITUTION_ID
}

export const ACCOUNT_COUNTRIES = [
  "Bulgaria",
  "Romania",
  "Greece",
  "Turkey",
  "Serbia",
  "North Macedonia",
  "Germany",
  "United Kingdom",
  "France",
  "Italy",
  "Spain",
  "Portugal",
  "Netherlands",
  "Belgium",
  "Austria",
  "Switzerland",
  "Poland",
  "Czech Republic",
  "Hungary",
  "Croatia",
  "Slovenia",
  "Slovakia",
  "Other",
] as const

export const PROFESSIONAL_TITLES = [
  { code: "DOCTOR", value: "Dr." },
  { code: "ASSOCIATE_PROFESSOR", value: "Assoc. Prof." },
  { code: "PROFESSOR", value: "Prof." },
  { code: "NURSE", value: "Nurse" },
  { code: "OTHER", value: "Other" },
] as const

export type PasswordPolicyIssue =
  | "too_short"
  | "missing_uppercase"
  | "missing_number"
  | "missing_special"

export const PASSWORD_MIN_LENGTH = 8

export function passwordPolicyIssues(password: string): PasswordPolicyIssue[] {
  const issues: PasswordPolicyIssue[] = []
  if (password.length < PASSWORD_MIN_LENGTH) issues.push("too_short")
  if (!/[A-Z]/.test(password)) issues.push("missing_uppercase")
  if (!/[0-9]/.test(password)) issues.push("missing_number")
  if (!/[^A-Za-z0-9]/.test(password)) issues.push("missing_special")
  return issues
}

export function passwordMeetsPolicy(password: string): boolean {
  return passwordPolicyIssues(password).length === 0
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export type RegisterAccountInput = {
  firstName: string
  lastName: string
  title?: string
  email: string
  password: string
  institutionId: string
  /** Explicit selector value; otherwise the accepted document locale wins. */
  locale?: PreferredLocale
  legalAcceptances: import("./legal").LegalAcceptanceReference[]
}

export type LoginAccountInput = {
  email: string
  password: string
  /** Present only when the person explicitly changed the pre-auth selector. */
  locale?: PreferredLocale
}

export type RegisterAccountResult = {
  id?: string
  email?: string
  verificationRequired?: boolean
  emailSent?: boolean
  devVerifyUrl?: string
}

export type PasswordResetRequestResult = {
  ok: boolean
  devResetUrl?: string
}

export type AuthTokenResponse = {
  access_token: string
  token_type: "Bearer"
  expires_in: number
  preferredLocale: PreferredLocale
}
