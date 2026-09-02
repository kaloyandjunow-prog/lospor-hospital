import "server-only"

import { mkdir, readFile, readdir, rename, stat } from "node:fs/promises"
import { join } from "node:path"

import { normalizeEhrImport } from "@lospor/core/ehr-import"

import { ehrExchangeRoot, INBOX } from "./ehr-transport-folder"
import { recordEhrImport, type EhrImportClient } from "./ehr-import"
import type { PatientIdentifierType } from "@/generated/prisma/enums"

/**
 * Read what the hospital system left for us.
 *
 * The mirror of the outbox, and it inherits the mirror of its hazard: a
 * hospital writing a file into a directory we poll can be caught mid-write just
 * as easily as the other way round. We cannot make their write atomic, so this
 * refuses to read a file that was modified a moment ago — a file still being
 * appended to keeps moving, and one that has stopped moving is finished.
 *
 * Nothing here writes to a case. Files become staged EhrImports, which a
 * clinician reviews field by field.
 */

/** Read, accepted, moved here. Kept briefly so an integration can be debugged. */
export const PROCESSED = "processed"
/** Unreadable or unusable. Kept so somebody can see what arrived. */
export const REJECTED = "rejected"

/**
 * How long a file must have been still before it is read.
 *
 * Not a guess about disk speed: it is the window in which a hospital's own
 * writer could still be appending. Too short and a half-written import is
 * staged as though it were complete; too long and a clinician waits for data
 * that has already arrived. Thirty seconds is short enough that the pull flow
 * still feels immediate — the clinician's request stays open for that long
 * anyway.
 */
export const INBOX_SETTLE_MS = 30_000

export type InboundFileResult =
  | { file: string; outcome: "imported"; importId: string; created: boolean }
  | { file: string; outcome: "skipped"; reason: "still-being-written" }
  | { file: string; outcome: "rejected"; reason: string }

type InboundDocument = {
  identifier?: unknown
  identifierType?: unknown
  sourceMessageId?: unknown
  fields?: unknown
}

async function moveTo(root: string, folder: string, name: string): Promise<void> {
  const target = join(root, folder)
  await mkdir(target, { recursive: true })
  await rename(join(root, INBOX, name), join(target, name)).catch(() => undefined)
}

/**
 * Stage one file.
 *
 * Every failure moves the file aside rather than leaving it to be retried
 * forever: a malformed message does not become malformed by waiting, and a
 * directory that fills with files nobody can read is how an integration stops
 * being watched at all.
 */
export async function ingestInboxFile(
  client: EhrImportClient,
  input: {
    institutionId: string
    file: string
    root?: string
    now?: Date
    settleMs?: number
  },
): Promise<InboundFileResult> {
  const root = input.root ?? ehrExchangeRoot()
  const now = input.now ?? new Date()
  const path = join(root, INBOX, input.file)

  const info = await stat(path)
  if (now.getTime() - info.mtimeMs < (input.settleMs ?? INBOX_SETTLE_MS)) {
    return { file: input.file, outcome: "skipped", reason: "still-being-written" }
  }

  let document: InboundDocument
  try {
    document = JSON.parse(await readFile(path, "utf8")) as InboundDocument
  } catch {
    await moveTo(root, REJECTED, input.file)
    return { file: input.file, outcome: "rejected", reason: "unreadable" }
  }

  const identifier = typeof document.identifier === "string" ? document.identifier.trim() : ""
  const identifierType = document.identifierType === "EGN" ? "EGN" : "IZ"
  if (!identifier) {
    // Without it there is no patient to attach this to, and guessing is not
    // available: the wrong patient's labs is the worst outcome here.
    await moveTo(root, REJECTED, input.file)
    return { file: input.file, outcome: "rejected", reason: "no-identifier" }
  }

  const fields = document.fields && typeof document.fields === "object"
    ? document.fields as Record<string, unknown>
    : {}

  const { canonical } = normalizeEhrImport({
    identifierType,
    identifier,
    sourceMessageId: typeof document.sourceMessageId === "string"
      ? document.sourceMessageId
      : input.file,
    fields,
  })

  if (canonical.fields.length === 0) {
    await moveTo(root, REJECTED, input.file)
    return { file: input.file, outcome: "rejected", reason: "nothing-importable" }
  }

  const recorded = await recordEhrImport(client, {
    institutionId: input.institutionId,
    identifier,
    identifierType: identifierType as PatientIdentifierType,
    transport: "FOLDER",
    canonical,
    now,
  })

  await moveTo(root, PROCESSED, input.file)
  return {
    file: input.file,
    outcome: "imported",
    importId: recorded.id,
    created: recorded.created,
  }
}

/**
 * Scan the inbox.
 *
 * One bad file never stops the scan. A hospital that drops a hundred files
 * overnight, one of them truncated, must still have the other ninety-nine
 * staged by morning.
 */
export async function scanEhrInbox(
  client: EhrImportClient,
  input: {
    institutionId: string
    root?: string
    now?: Date
    settleMs?: number
    limit?: number
  },
): Promise<InboundFileResult[]> {
  const root = input.root ?? ehrExchangeRoot()
  const inbox = join(root, INBOX)
  await mkdir(inbox, { recursive: true })

  const names = (await readdir(inbox, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map(entry => entry.name)
    .sort()
    .slice(0, input.limit ?? 50)

  const results: InboundFileResult[] = []
  for (const file of names) {
    try {
      results.push(await ingestInboxFile(client, { ...input, file, root }))
    } catch {
      console.error("[ehr] EHR_INBOX_FILE_FAILED")
      results.push({ file, outcome: "rejected", reason: "error" })
    }
  }
  return results
}
