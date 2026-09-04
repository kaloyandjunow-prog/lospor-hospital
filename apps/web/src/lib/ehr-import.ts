import {
  lookupEhrImport as coreLookup,
  recordEhrDecisions as coreRecord,
  type EhrImportLookup,
  type EhrImportOffer,
} from "@lospor/core/ehr-import-client"

/**
 * This client's fetcher, bound to the shared import client.
 *
 * Everything above the fetch — the request, the response reading, the status
 * classification and the order decisions are recorded in — lives in Core, so
 * this app and the PWA cannot disagree about what a 409 means or which write
 * happens first. All that differs between the two is which fetch is passed.
 *
 * Same-origin here, so the platform `fetch` carries the session cookie
 * unaided; the mobile build has to pass its own authenticated wrapper.
 */

export type { EhrImportLookup, EhrImportOffer }

export function lookupEhrImport(
  caseId: string,
  identifier: string,
  identifierType: "IZ" | "EGN" = "IZ",
): Promise<EhrImportLookup> {
  return coreLookup(fetch, { caseId, identifier, identifierType })
}

export function recordEhrDecisions(
  caseId: string,
  importId: string,
  acceptedKeys: string[],
  declinedKeys: string[],
): Promise<void> {
  return coreRecord(fetch, { caseId, importId, acceptedKeys, declinedKeys })
}
