import { apiFetch } from "./api"

export type PatientReference = {
  id: string
  maskedIdentifier: string
}

type CaseRelinkFetcher = (path: string, init?: RequestInit) => Promise<Response>

function readPatientReference(value: unknown): PatientReference | null {
  if (!value || typeof value !== "object") return null
  const { id, maskedIdentifier } = value as Record<string, unknown>
  return typeof id === "string" && id.length > 0
    && typeof maskedIdentifier === "string" && maskedIdentifier.length > 0
    ? { id, maskedIdentifier }
    : null
}

export function patientReferenceFromResponse(body: unknown): PatientReference | null {
  return body && typeof body === "object"
    ? readPatientReference((body as Record<string, unknown>).patientReference)
    : null
}

/**
 * Deliberately online-only patient relinking.
 *
 * The raw number is sent only in the API's dedicated identity envelope. It is
 * never copied into preop data, local drafts, errors, logs, or return values.
 */
export async function relinkCasePatientReference(
  caseId: string,
  patientNumberInput: string,
  fetcher: CaseRelinkFetcher = apiFetch,
): Promise<PatientReference> {
  const patientNumber = patientNumberInput.trim()
  if (!caseId || !patientNumber || patientNumber.length > 128) {
    throw new Error("A valid hospital patient number is required.")
  }
  const response = await fetcher(`/api/cases/${encodeURIComponent(caseId)}`, {
    method: "PATCH",
    body: JSON.stringify({ patientNumber }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error("The patient link could not be changed.")
  const reference = patientReferenceFromResponse(body)
  if (!reference) throw new Error("The server did not confirm the patient link.")
  return reference
}
