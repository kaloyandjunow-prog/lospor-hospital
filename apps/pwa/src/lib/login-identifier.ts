export type LoginIdentifier = "EMAIL" | "USERNAME"

export type LoginCredential =
  | { loginIdentifier: "EMAIL"; value: string }
  | { loginIdentifier: "USERNAME"; value: string }

// Hospital usernames are deliberately ASCII-only identifiers. Display names
// remain separate account data and continue to support Unicode/Cyrillic.
const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{2,63}$/

export function isValidHospitalUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value)
}

export function loginRequestIdentifier(
  credential: LoginCredential,
): { email: string } | { username: string } {
  if (credential.loginIdentifier === "USERNAME") {
    // Preserve the administrator-issued spelling exactly. The API owns the
    // case-insensitive lookup and uniqueness rules.
    return { username: credential.value }
  }
  return { email: credential.value.trim().toLowerCase() }
}
