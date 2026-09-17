import "server-only"

import { readdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"

import { EHR_IMPORT_RETENTION_DAYS } from "@/lib/hospital/ehr-import"
import { PROCESSED, REJECTED } from "@/lib/hospital/ehr-inbox-folder"
import { ehrExchangeRoot } from "@/lib/hospital/ehr-transport-folder"
import { prisma } from "@/lib/prisma"

/**
 * Deleting EHR staging data once nobody needs it.
 *
 * What the hospital system sends waits in EhrImport until a clinician reviews
 * it. Imports always carried a 14-day expiry, but the expiry was only ever a
 * filter on reads: nothing deleted an expired import, its fields, or the
 * processed and rejected files the folder transport keeps. All of them hold
 * identifiers and clinical content, often for patients who never get a case
 * here, and they accumulated for as long as the appliance ran.
 *
 * The default is the 14 days an import was always offered for. A site may
 * shorten it in Status, never lengthen it past that: a clinician is offered an
 * import for 14 days, and keeping it longer would retain clinical data nobody
 * can use.
 */

export const EHR_STAGING_RETENTION_MIN_DAYS = 1
export const EHR_STAGING_RETENTION_MAX_DAYS = EHR_IMPORT_RETENTION_DAYS

const DAY_MS = 86_400_000

export type EhrStagingPurgeResult = {
  retentionDays: number
  importsDeleted: number
  filesDeleted: number
}

export async function ehrStagingRetentionDays(): Promise<number> {
  const policy = await prisma.hospitalEhrTransportPolicy.findUnique({
    where: { id: "local" },
    select: { stagingRetentionDays: true },
  })
  const days = policy?.stagingRetentionDays ?? EHR_IMPORT_RETENTION_DAYS
  return Math.min(EHR_STAGING_RETENTION_MAX_DAYS, Math.max(EHR_STAGING_RETENTION_MIN_DAYS, days))
}

/**
 * Removes kept inbox files older than the cutoff. Only regular files directly
 * inside processed/ and rejected/ are touched; the inbox itself holds files not
 * yet read, and the outbox belongs to the hospital system that collects it.
 */
async function purgeKeptFiles(root: string, cutoff: Date): Promise<number> {
  let deleted = 0
  for (const folder of [PROCESSED, REJECTED]) {
    const directory = join(root, folder)
    let names: string[]
    try {
      names = await readdir(directory)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
      throw error
    }
    for (const name of names) {
      const path = join(directory, name)
      const info = await stat(path)
      if (!info.isFile() || info.mtime >= cutoff) continue
      await rm(path, { force: true })
      deleted += 1
    }
  }
  return deleted
}

export async function purgeEhrStaging(
  options: { now?: Date; retentionDays?: number; exchangeRoot?: string } = {},
): Promise<EhrStagingPurgeResult> {
  const now = options.now ?? new Date()
  const retentionDays = options.retentionDays ?? await ehrStagingRetentionDays()
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS)
  // Past its expiry or older than the site's window, whichever comes first.
  // Fields go with their import (onDelete: Cascade).
  const { count } = await prisma.ehrImport.deleteMany({
    where: { OR: [{ expiresAt: { lte: now } }, { receivedAt: { lte: cutoff } }] },
  })
  const filesDeleted = await purgeKeptFiles(options.exchangeRoot ?? ehrExchangeRoot(), cutoff)
  return { retentionDays, importsDeleted: count, filesDeleted }
}
