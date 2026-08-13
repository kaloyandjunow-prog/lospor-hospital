export type HospitalPatientReference = {
  id: string
  maskedIdentifier: string
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

  return { id, maskedIdentifier }
}
