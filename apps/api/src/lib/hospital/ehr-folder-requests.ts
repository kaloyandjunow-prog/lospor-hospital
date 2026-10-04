import "server-only"

import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"

import type { PatientIdentifierType } from "@/generated/prisma/enums"

import { importIdentityCandidates } from "./ehr-import"
import { ehrExchangeRoot, OUTBOX, writeExchangeFile } from "./ehr-transport-folder"
import { ehrTransportAccess, type EhrTransportAccess } from "./ehr-transport-policy"

/**
 * Asking the hospital system for a patient over the watched folder (1.5.0).
 *
 * A folder is pushed: the hospital writes when it writes, and a clinician who
 * typed a record number before anything arrived used to be told the hospital
 * held nothing -- which reads as a patient with no history. A site whose
 * vendor agrees can switch requests on in Status. Then a lookup that finds
 * nothing drops outbox/request-<id>.json with the patient number, and the
 * vendor answers with an ordinary inbox file (carrying the same requestId, or
 * with empty fields when the hospital holds nothing).
 *
 * Off by default, because a request nobody answers only piles up.
 *
 * State lives in the folders, not the database:
 * - requests/<id>.json: LOSPOR's own record that it asked, with no patient
 *   number in it. The outbox copy belongs to the vendor, who may collect it.
 * - results/answer-<id>.json: written by the inbox when a file names the
 *   request, so an answer is one file lookup rather than a scan.
 */

/** LOSPOR's own record of the requests it made. Read by nobody else. */
export const REQUESTS = "requests"

const REQUEST_ID = /^[a-f0-9]{32}$/

/**
 * One id per patient per day.
 *
 * Derived from the keyed identity hash, so it says nothing about the patient
 * to anyone without the appliance's key, and so every lookup of the same
 * patient the same day names the same request: three clinicians and a
 * reopened form ask the hospital once, not five times.
 */
export function folderRequestId(
  institutionId: string,
  identifierType: PatientIdentifierType,
  identifier: string,
  now: Date,
): string {
  const [identity] = importIdentityCandidates(institutionId, identifierType, identifier, now)
  return createHash("sha256")
    .update(`lospor-folder-request-v1|${identity.identifierHash}|${now.toISOString().slice(0, 10)}`)
    .digest("hex")
    .slice(0, 32)
}

export const isFolderRequestId = (value: unknown): value is string =>
  typeof value === "string" && REQUEST_ID.test(value)

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false)
}

export const answerFileName = (requestId: string) => `answer-${requestId}.json`

/** What the hospital system's answer amounted to, once it has come. */
export async function folderRequestAnswer(requestId: string, root = ehrExchangeRoot()): Promise<"imported" | "rejected" | null> {
  try {
    const answer = JSON.parse(await readFile(join(root, "results", answerFileName(requestId)), "utf8")) as { outcome?: unknown }
    return answer.outcome === "imported" ? "imported" : "rejected"
  } catch {
    return null
  }
}

/**
 * The folder half of a lookup that found nothing.
 *
 * Returns the request still waiting for an answer, or null when the site does
 * not ask, the hospital has already answered (an answer that staged something
 * is found by the lookup itself; one that staged nothing means it holds
 * nothing), or -- on a repeat check -- nothing was ever asked.
 *
 * `request` is the clinician's own lookup: it asks, once per patient per day.
 * A repeat check while waiting never writes, so checking cannot become asking.
 */
export async function folderRequestFor(input: {
  institutionId: string
  identifierType: PatientIdentifierType
  identifier: string
  request: boolean
  /**
   * The request a repeat check is waiting on. Accepted only as this patient's
   * request from today or yesterday, so a check across midnight still finds it
   * and an id cannot be used to probe another patient.
   */
  requestId?: string
  now?: Date
  root?: string
  access?: EhrTransportAccess
}): Promise<{ requestId: string } | null> {
  const access = input.access ?? await ehrTransportAccess()
  if (!access.enabled || access.transport !== "FOLDER" || !access.folderRequests) return null

  const now = input.now ?? new Date()
  const root = input.root ?? ehrExchangeRoot()
  const today = folderRequestId(input.institutionId, input.identifierType, input.identifier, now)
  const yesterday = folderRequestId(input.institutionId, input.identifierType, input.identifier, new Date(now.getTime() - 86_400_000))
  const requestId = !input.request && input.requestId && [today, yesterday].includes(input.requestId) ? input.requestId : today
  if (await folderRequestAnswer(requestId, root)) return null

  const marker = join(root, REQUESTS, `${requestId}.json`)
  if (await exists(marker)) return { requestId }
  if (!input.request) return null

  const requestedAt = now.toISOString()
  await writeExchangeFile(OUTBOX, `request-${requestId}.json`, `${JSON.stringify({
    formatVersion: 1,
    kind: "PATIENT_REQUEST",
    requestId,
    requestedAt,
    identifierType: input.identifierType,
    identifier: input.identifier.trim(),
  }, null, 2)}\n`, root)
  // Written after the request itself: a marker for a request that failed to
  // reach the outbox would wait for an answer to a question never asked.
  await writeExchangeFile(REQUESTS, `${requestId}.json`, `${JSON.stringify({ requestId, requestedAt })}\n`, root)
  return { requestId }
}
