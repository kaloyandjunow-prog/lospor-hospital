export const CURRENT_TERMS_VERSION = "4.0"

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
  institutionId?: string
  acceptedTerms: boolean
}

export type RegisterAccountResult = {
  id?: string
  email?: string
  pending?: boolean
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
}
