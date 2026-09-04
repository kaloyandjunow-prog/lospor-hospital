import type { EhrReviewPlan } from "@lospor/core/ehr-import-review"

/**
 * Asking the hospital system what it holds for this patient.
 *
 * The same contract the PWA speaks, deliberately: one route, one shape, and the
 * review itself is a plan Core built, so the two clients cannot drift about
 * what a clinician is being offered.
 *
 * The record number never reaches local storage, a draft, an error message or a
 * log — it goes into the query of one request and is gone. What comes back is
 * masked or clinical.
 */

export type EhrImportOffer = {
  importId: string
  maskedIdentifier: string
  receivedAt: string
  plan: EhrReviewPlan
}

export type EhrImportLookup =
  | { status: "offer"; offer: EhrImportOffer }
  /** The server answered, and the hospital has nothing for this patient. */
  | { status: "none" }
  /** The record number matched more than one patient; refusing is the answer. */
  | { status: "ambiguous" }
  | { status: "unavailable"; code?: string }

export async function lookupEhrImport(
  caseId: string,
  identifier: string,
  identifierType: "IZ" | "EGN" = "IZ",
): Promise<EhrImportLookup> {
  const trimmed = identifier.trim()
  if (!caseId || !trimmed) return { status: "none" }

  const query = new URLSearchParams({ identifier: trimmed, identifierType })
  let response: Response
  try {
    response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/ehr-import?${query.toString()}`)
  } catch {
    // Offline, or the appliance is unreachable. Not worth a dialog: manual
    // entry is the path that always works and is already on screen.
    return { status: "unavailable" }
  }

  const body = await response.json().catch(() => null) as Record<string, unknown> | null

  if (response.status === 409) {
    return body?.code === "PATIENT_AMBIGUOUS"
      ? { status: "ambiguous" }
      : { status: "unavailable", code: typeof body?.code === "string" ? body.code : undefined }
  }
  if (!response.ok) {
    return { status: "unavailable", code: typeof body?.code === "string" ? body.code : undefined }
  }
  if (!body?.pending) return { status: "none" }

  return {
    status: "offer",
    offer: {
      importId: String(body.importId ?? ""),
      maskedIdentifier: String(body.maskedIdentifier ?? ""),
      receivedAt: String(body.receivedAt ?? ""),
      plan: body.plan as EhrReviewPlan,
    },
  }
}

/**
 * Record what the clinician decided.
 *
 * Called **after** the accepted values have been written through the ordinary
 * case save. A failure between the two leaves the import pending and
 * self-corrects, because a value already in the case comes back `unchanged`;
 * recording first would mark an item decided that never reached the record.
 */
export async function recordEhrDecisions(
  caseId: string,
  importId: string,
  acceptedKeys: string[],
  declinedKeys: string[],
): Promise<void> {
  await fetch(`/api/cases/${encodeURIComponent(caseId)}/ehr-import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ importId, acceptedKeys, declinedKeys }),
  }).catch(() => undefined)
}
