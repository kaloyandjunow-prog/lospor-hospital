import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const deleteMany = vi.fn(async (_args: unknown) => ({ count: 3 }))
const findUnique = vi.fn(async (_args: unknown): Promise<{ stagingRetentionDays: number } | null> => null)
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ehrImport: { deleteMany: (args: unknown) => deleteMany(args) },
    hospitalEhrTransportPolicy: { findUnique: (args: unknown) => findUnique(args) },
    hospitalEhrLabCodeMap: { findMany: async () => [], upsert: async () => undefined },
  },
}))

import { ehrStagingRetentionDays, purgeEhrStaging } from "./ehr-retention"

/**
 * Staged EHR data holds identifiers and clinical content, often for patients
 * who never get a case. It used to expire only as a filter on reads; these hold
 * that it is now really deleted, rows and kept files alike.
 */

const NOW = new Date("2026-09-13T12:00:00.000Z")
const DAY = 86_400_000
let root = ""

async function keptFile(folder: string, name: string, ageDays: number) {
  await mkdir(join(root, folder), { recursive: true })
  const path = join(root, folder, name)
  await writeFile(path, "{}", "utf8")
  const when = new Date(NOW.getTime() - ageDays * DAY)
  await utimes(path, when, when)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "lospor-ehr-retention-"))
  deleteMany.mockClear()
  findUnique.mockReset()
  findUnique.mockResolvedValue(null)
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("purging EHR staging data", () => {
  it("deletes imports past their expiry or older than the window, with 14 days by default", async () => {
    const result = await purgeEhrStaging({ now: NOW, exchangeRoot: root })
    expect(result).toEqual({ retentionDays: 14, importsDeleted: 3, filesDeleted: 0 })
    expect(deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ expiresAt: { lte: NOW } }, { receivedAt: { lte: new Date(NOW.getTime() - 14 * DAY) } }] },
    })
  })

  it("follows a shortened window from Status", async () => {
    findUnique.mockResolvedValue({ stagingRetentionDays: 3 })
    const result = await purgeEhrStaging({ now: NOW, exchangeRoot: root })
    expect(result.retentionDays).toBe(3)
    expect(deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ expiresAt: { lte: NOW } }, { receivedAt: { lte: new Date(NOW.getTime() - 3 * DAY) } }] },
    })
  })

  it("never keeps data longer than 14 days, whatever is stored", async () => {
    findUnique.mockResolvedValue({ stagingRetentionDays: 400 })
    expect(await ehrStagingRetentionDays()).toBe(14)
    findUnique.mockResolvedValue({ stagingRetentionDays: 0 })
    expect(await ehrStagingRetentionDays()).toBe(1)
  })

  it("deletes old processed and rejected files, and never the inbox or the outbox", async () => {
    await keptFile("processed", "old.json", 20)
    await keptFile("processed", "recent.json", 2)
    await keptFile("rejected", "old-bad.json", 15)
    await keptFile("inbox", "waiting.json", 30)
    await keptFile("outbox", "protocol.json", 30)
    const result = await purgeEhrStaging({ now: NOW, exchangeRoot: root, retentionDays: 14 })
    expect(result.filesDeleted).toBe(2)
    expect(await readdir(join(root, "processed"))).toEqual(["recent.json"])
    expect(await readdir(join(root, "rejected"))).toEqual([])
    expect(await readdir(join(root, "inbox"))).toEqual(["waiting.json"])
    expect(await readdir(join(root, "outbox"))).toEqual(["protocol.json"])
  })

  it("does not fail for a site that has never used the folder transport", async () => {
    await expect(purgeEhrStaging({ now: NOW, exchangeRoot: join(root, "missing"), retentionDays: 14 })).resolves.toMatchObject({ filesDeleted: 0 })
  })

  it("fails loudly when the database refuses, so the retention job reports it", async () => {
    deleteMany.mockRejectedValueOnce(new Error("permission denied"))
    await expect(purgeEhrStaging({ now: NOW, exchangeRoot: root, retentionDays: 14 })).rejects.toThrow()
  })
})
