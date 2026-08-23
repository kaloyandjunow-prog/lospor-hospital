export type LoginCredential =
  | { loginIdentifier: "EMAIL"; value: string }
  | { loginIdentifier: "USERNAME"; value: string }

const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{2,63}$/

export function isValidHospitalUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value)
}

export function loginRequestIdentifier(credential: LoginCredential) {
  return credential.loginIdentifier === "USERNAME"
    ? { username: credential.value }
    : { email: credential.value.trim().toLowerCase() }
}
