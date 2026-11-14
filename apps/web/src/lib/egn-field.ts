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

/**
 * The ЕГН a new case is created with. A mistyped one never blocks the case:
 * the field has already said what is wrong, the case is created without it
 * (`dropped`), and the ЕГН is added from the header once it is right. Sending
 * it got "Invalid request" back on every autosave, so nothing at all was
 * saved until the whole preop form was done.
 */
export function nationalIdForCreate(typed: string | null | undefined): { send?: string; dropped: boolean } {
  const send = validEgnOrNull(typed) ?? undefined
  return { send, dropped: Boolean(typed?.trim() && !send) }
}

/** The ЕГН to send, or null when the field is empty or not a valid ЕГН. */
export function validEgnOrNull(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\s+/g, "")
  return digits && egnFieldIssue(digits, true) === null ? digits : null
}
