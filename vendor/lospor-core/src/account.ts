export const CURRENT_TERMS_VERSION = "4.0"

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
