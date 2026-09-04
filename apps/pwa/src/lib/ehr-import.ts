import {
  lookupEhrImport as coreLookup,
  recordEhrDecisions as coreRecord,
  type EhrImportLookup,
  type EhrImportOffer,
} from "@lospor/core/ehr-import-client"

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

export function lookupEhrImport(
  caseId: string,
  identifier: string,
  identifierType: "IZ" | "EGN" = "IZ",
): Promise<EhrImportLookup> {
  return coreLookup(apiFetch, { caseId, identifier, identifierType })
}

export function recordEhrDecisions(
  caseId: string,
  importId: string,
  acceptedKeys: string[],
  declinedKeys: string[],
): Promise<void> {
  return coreRecord(apiFetch, { caseId, importId, acceptedKeys, declinedKeys })
}
