import "server-only"

import { mkdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { hospitalConfig } from "@/lib/hospital/config"

/**
 * The folder-drop transport: a file written into a directory the hospital
 * system watches.
 *
 * The first transport built, because it is the one that can be exercised with
 * no hospital involved and works on an air-gapped appliance. It needs no
 * browser and no egress — a mounted volume is the whole integration — which is
 * why it lives in the API rather than a separate container.
 *
 * Everything it writes is a plain file. What makes it safe is not the format
 * but the writing: a watcher polling a directory will happily pick up a file
 * that is still being written, so nothing is ever written in place.
 */

/** Written by this appliance, read by the hospital. */
export const OUTBOX = "outbox"
/** Written by the hospital, read by this appliance. */
export const INBOX = "inbox"
/** Where a partially-written file lives until it is complete. */
const STAGING = ".staging"

export function ehrExchangeRoot(): string {
  return hospitalConfig().HOSPITAL_EHR_DIR
}

/**
 * A filename carries no clinical meaning.
 *
 * A directory listing is the least protected surface in an integration — it
 * shows up in backups, in monitoring, over somebody's shoulder — so the record
 * number goes inside the file where the rest of the clinical content is, not
 * in a name that is visible without opening anything.
 *
 * The delivery id is stable across retries, so a redelivery overwrites its own
 * file rather than leaving two the hospital might file twice.
 */
export function outboxFileName(deliveryId: string, kind: string, extension: string): string {
  return `${kind.toLowerCase()}-${deliveryId}.${extension}`
}

/**
 * Write a file so a watcher never sees a partial one.
 *
 * Written to a staging directory first and renamed into place. A rename within
 * one filesystem is atomic, so the file either is not there or is complete —
 * there is no moment where a hospital system can read half a protocol and file
 * it as the whole thing. Writing directly into the watched directory is the
 * obvious implementation and the one that produces truncated clinical
 * documents under load.
 */
export async function writeOutboxFile(
  name: string,
  contents: string,
  root = ehrExchangeRoot(),
): Promise<string> {
  const stagingDir = join(root, STAGING)
  const outboxDir = join(root, OUTBOX)
  await mkdir(stagingDir, { recursive: true })
  await mkdir(outboxDir, { recursive: true })

  const staged = join(stagingDir, name)
  const destination = join(outboxDir, name)
  await writeFile(staged, contents, { encoding: "utf8", mode: 0o640 })
  await rename(staged, destination)
  return destination
}

export type EhrOutboundMessage = {
  deliveryId: string
  kind: string
  /** The coded header, and the printable record when there is one. */
  header: unknown
  documentHtml?: string | null
}

/**
 * Drop one message into the outbox.
 *
 * The header and the document are separate files rather than one envelope, so
 * a hospital that only files documents can ignore the header and one that only
 * parses structure never has to open the HTML. Both name the same delivery, so
 * a receiver that wants both can pair them.
 */
export async function dropOutboundMessage(
  message: EhrOutboundMessage,
  root = ehrExchangeRoot(),
): Promise<string[]> {
  const written: string[] = []

  written.push(await writeOutboxFile(
    outboxFileName(message.deliveryId, message.kind, "json"),
    `${JSON.stringify(message.header, null, 2)}\n`,
    root,
  ))

  if (message.documentHtml) {
    written.push(await writeOutboxFile(
      outboxFileName(message.deliveryId, message.kind, "html"),
      message.documentHtml,
      root,
    ))
  }

  return written
}
