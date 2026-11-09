export type HospitalPatientReference = {
  id: string
  maskedIdentifier: string
  /** The person's ЕГН, masked, once it is recorded for this admission. */
  personMaskedIdentifier?: string | null
  /** The full ИЗ № while the site shows it (Status switch, on by default). */
  display?: PatientDisplay | null
}

/** What the API sends as `patientDisplay`: the number as written, and the first six digits of a known ЕГН. */
export type PatientDisplay = { admissionNumber: string | null; egnPrefix: string | null }

/**
 * Read `patientDisplay` defensively: a number is digits with an optional /year,
 * an ЕГН prefix is six digits. Anything else is dropped, never printed.
 */
export function readPatientDisplay(value: unknown): PatientDisplay | null {
  if (!value || typeof value !== "object") return null
  const number = (value as { admissionNumber?: unknown }).admissionNumber
  const prefix = (value as { egnPrefix?: unknown }).egnPrefix
  const admissionNumber = typeof number === "string" && /^[0-9A-Za-zА-Яа-я./-]{1,32}$/.test(number) ? number : null
  const egnPrefix = typeof prefix === "string" && /^\d{6}$/.test(prefix) ? prefix : null
  return admissionNumber || egnPrefix ? { admissionNumber, egnPrefix } : null
}

/**
 * Read the Hospital-only patient reference returned by the appliance API.
 *
 * The browser must never treat an arbitrary server string as safe to display.
 * A real masked identifier produced by the API always contains at least one
 * asterisk; anything else is rejected instead of risking an unmasked hospital
 * number appearing in the UI.
 */
export function readHospitalPatientReference(body: unknown): HospitalPatientReference | null {
  if (!body || typeof body !== "object") return null
  const value = (body as { patientReference?: unknown }).patientReference
  if (!value || typeof value !== "object") return null

  const id = (value as { id?: unknown }).id
  const maskedIdentifier = (value as { maskedIdentifier?: unknown }).maskedIdentifier
  if (typeof id !== "string" || !id) return null
  if (
    typeof maskedIdentifier !== "string"
    || !maskedIdentifier
    || maskedIdentifier.length > 128
    || !maskedIdentifier.includes("*")
  ) return null

  const person = (value as { personMaskedIdentifier?: unknown }).personMaskedIdentifier
  const personMaskedIdentifier = typeof person === "string" && person.includes("*") && person.length <= 128 ? person : null
  return { id, maskedIdentifier, personMaskedIdentifier, display: readPatientDisplay((body as { patientDisplay?: unknown }).patientDisplay) }
}
