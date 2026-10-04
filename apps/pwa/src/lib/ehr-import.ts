import {
  lookupEhrImport as coreLookup,
  recordEhrDecisions as coreRecord,
  type EhrImportLookup,
  type EhrImportOffer,
} from "@lospor/core/ehr-import-transport"

import { apiFetch } from "./api"

/**
 * This client's fetcher, bound to the shared import client.
 *
 * Everything above the fetch — the request, the response reading, the status
 * classification and the order decisions are recorded in — lives in Core, so
 * the web app and this one cannot disagree about what a 409 means or which
 * write happens first. All that differs between the two is the line below.
 */

export type { EhrImportLookup, EhrImportOffer }

/**
 * How a lookup treats the hospital system on a watched-folder site that asks
 * (1.5.0): `request` asks it, `requestId` re-checks a request already made.
 */
export type EhrLookupAsk = { request?: boolean; requestId?: string }

export function lookupEhrImport(
  caseId: string,
  identifier: string,
  identifierType: "IZ" | "EGN" = "IZ",
  ask: EhrLookupAsk = {},
): Promise<EhrImportLookup> {
  return coreLookup(apiFetch, { caseId, identifier, identifierType, ...ask })
}

export function recordEhrDecisions(
  caseId: string,
  importId: string,
  acceptedKeys: string[],
  declinedKeys: string[],
): Promise<void> {
  return coreRecord(apiFetch, { caseId, importId, acceptedKeys, declinedKeys })
}

/**
 * Ask about a patient before the case exists.
 *
 * The case-scoped lookup above needs a saved case, and a case needs an age, a
 * height and a weight -- none of which the clinician has yet, because asking
 * the hospital is how they were going to get them. This one is scoped to the
 * signed-in account's institution instead. Decisions are still recorded
 * against a case, once accepting the import has produced one.
 *
 * Not in Core with the other two: the route it calls exists only on the
 * appliance, and Core is shared with a product that has no hospital to ask.
 */
export async function lookupEhrImportWithoutCase(
  identifier: string,
  identifierType: "IZ" | "EGN" = "IZ",
  ask: EhrLookupAsk = {},
): Promise<EhrImportLookup> {
  const query = new URLSearchParams({
    identifier,
    identifierType,
    ...(ask.request ? { request: "1" } : {}),
    ...(ask.requestId ? { requestId: ask.requestId } : {}),
  })
  const response = await apiFetch(`/api/ehr-import/lookup?${query.toString()}`)
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { code?: string } | null
    return { status: body?.code === "ambiguous" ? "ambiguous" : "unavailable" }
  }
  const body = await response.json().catch(() => null) as { pending?: boolean; requested?: boolean; requestId?: unknown } | null
  if (!body?.pending) {
    // Asked of the hospital system over the folder, and not answered yet (1.5.0).
    return body?.requested === true && typeof body.requestId === "string" && body.requestId
      ? { status: "requested", requestId: body.requestId }
      : { status: "none" }
  }
  return { status: "offer", offer: body as unknown as EhrImportOffer }
}

/**
 * Laboratory results drawn during the case, from the hospital system
 * (1.4.13). The appliance asks with the case's own patient reference, so the
 * screen needs no number, and returns only results drawn since the case
 * started. Appliance-only, like the lookup above.
 */
export async function lookupIntraopEhrLabs(caseId: string): Promise<EhrImportLookup> {
  const response = await apiFetch(`/api/cases/${encodeURIComponent(caseId)}/ehr-import/intraop-labs`)
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { code?: string } | null
    return { status: body?.code === "PATIENT_AMBIGUOUS" ? "ambiguous" : "unavailable" }
  }
  const body = await response.json().catch(() => null) as { pending?: boolean } | null
  if (!body?.pending) return { status: "none" }
  return { status: "offer", offer: body as unknown as EhrImportOffer }
}
