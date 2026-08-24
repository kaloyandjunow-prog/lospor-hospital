export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 64

const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{2,63}$/

/** Validates the display spelling without normalizing or changing its case. */
export function isValidLoginUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value)
}
