import { isValidEgnChecksum } from "@lospor/core/ehr-age"

/**
 * What is wrong with an ЕГН while it is being typed, so the clinician sees a
 * typo at once instead of an "Invalid request" after the whole preop form.
 * The rule is the server's (`isValidEgn`): ten digits and the check digit,
 * spaces ignored. An unfinished number is only flagged once the field is left.
 */
export type EgnFieldIssue = "invalid" | "incomplete"

export function egnFieldIssue(value: string | null | undefined, left: boolean): EgnFieldIssue | null {
  const digits = (value ?? "").replace(/\s+/g, "")
  if (!digits) return null
  if (!/^\d+$/.test(digits) || digits.length > 10) return "invalid"
  if (digits.length < 10) return left ? "incomplete" : null
  return isValidEgnChecksum(digits) ? null : "invalid"
}

/** The ЕГН to send, or null when the field is empty or not a valid ЕГН. */
export function validEgnOrNull(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\s+/g, "")
  return digits && egnFieldIssue(digits, true) === null ? digits : null
}
