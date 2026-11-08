import { apiFetch } from "./api"

export type PatientReference = {
  id: string
  maskedIdentifier: string
  /** The person's ЕГН, masked, once recorded for this admission. */
  personMaskedIdentifier?: string | null
}

type CaseRelinkFetcher = (path: string, init?: RequestInit) => Promise<Response>

function readPatientReference(value: unknown): PatientReference | null {
  if (!value || typeof value !== "object") return null
  const { id, maskedIdentifier, personMaskedIdentifier } = value as Record<string, unknown>
  return typeof id === "string" && id.length > 0
    && typeof maskedIdentifier === "string" && maskedIdentifier.length > 0
    ? { id, maskedIdentifier, personMaskedIdentifier: typeof personMaskedIdentifier === "string" && personMaskedIdentifier.includes("*") ? personMaskedIdentifier : null }
    : null
}

export function patientReferenceFromResponse(body: unknown): PatientReference | null {
  return body && typeof body === "object"
    ? readPatientReference((body as Record<string, unknown>).patientReference)
    : null
}

export class PatientEgnError extends Error {
  constructor(readonly code: "INVALID_EGN" | "TAKEN" | "FAILED") {
    super(code)
  }
}

/**
 * Record the ЕГН of a saved case. Online only; it only fills a gap, so an
 * admission that already has a different ЕГН is refused (an administrator's
 * correction). Returns the masked ЕГН the server recorded.
 */
export async function addCasePatientEgn(
  caseId: string,
  nationalIdInput: string,
  fetcher: CaseRelinkFetcher = apiFetch,
): Promise<string> {
  const nationalId = nationalIdInput.replace(/\s+/g, "")
  if (!caseId || !nationalId) throw new PatientEgnError("INVALID_EGN")
  const response = await fetcher(`/api/cases/${encodeURIComponent(caseId)}/patient-link/person`, {
    method: "POST",
    body: JSON.stringify({ nationalId }),
  })
  const body = await response.json().catch(() => null) as { code?: string; personMaskedIdentifier?: unknown } | null
  if (!response.ok) throw new PatientEgnError(body?.code === "INVALID_EGN" ? "INVALID_EGN" : response.status === 409 ? "TAKEN" : "FAILED")
  const masked = body?.personMaskedIdentifier
  if (typeof masked !== "string" || !masked.includes("*")) throw new PatientEgnError("FAILED")
  return masked
}

/**
 * Deliberately online-only patient relinking.
 *
 * The raw number is sent only in the API's dedicated identity envelope. It is
 * never copied into preop data, local drafts, errors, logs, or return values.
 */
export async function relinkCasePatientReference(
  caseId: string,
  expectedPatientLinkId: string,
  patientNumberInput: string,
  correctionReasonInput: string,
  fetcher: CaseRelinkFetcher = apiFetch,
): Promise<PatientReference> {
  const patientNumber = patientNumberInput.trim()
  const correctionReason = correctionReasonInput.trim()
  if (!caseId || !patientNumber || patientNumber.length > 128) {
    throw new Error("A valid hospital patient number is required.")
  }
  if (!expectedPatientLinkId || !correctionReason) {
    throw new Error("A reason is required to correct the patient a case belongs to.")
  }
  // Its own endpoint, not the case save. Sending the link the caller believes
  // the case has means a correction made against a stale view is refused
  // instead of silently overwriting whatever another device did.
  const response = await fetcher(
    `/api/cases/${encodeURIComponent(caseId)}/patient-link/correct`, {
    method: "POST",
    body: JSON.stringify({ expectedPatientLinkId, newPatientNumber: patientNumber, correctionReason }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error("The patient link could not be changed.")
  const reference = patientReferenceFromResponse(body)
  if (!reference) throw new Error("The server did not confirm the patient link.")
  return reference
}
