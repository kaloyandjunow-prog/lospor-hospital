import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({
  prisma: { hospitalEhrLabCodeMap: { findMany: async () => [], upsert: async () => undefined } },
}))

import { folderRequestAnswer, folderRequestFor, folderRequestId, REQUESTS } from "./ehr-folder-requests"
import { ingestInboxFile } from "./ehr-inbox-folder"
import { INBOX, OUTBOX } from "./ehr-transport-folder"
import type { EhrImportClient } from "./ehr-import"

process.env.HOSPITAL_PATIENT_HMAC_KEY ??= Buffer.alloc(32, 1).toString("base64")

/**
 * Asking the hospital system over the watched folder (1.5.0). Off by default;
 * on, a lookup that finds nothing asks once per patient per day, a repeat check
 * never asks, and the answer is an ordinary inbox file.
 */

const NOW = new Date("2026-10-05T10:00:00.000Z")
const ASKS = { enabled: true as const, transport: "FOLDER" as const, folderRequests: true }
let root = ""

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "lospor-ehr-requests-")) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

const ask = (overrides: Partial<Parameters<typeof folderRequestFor>[0]> = {}) => folderRequestFor({
  institutionId: "inst-1", identifierType: "IZ", identifier: "2026-004512", request: true, now: NOW, root, access: ASKS, ...overrides,
})
const listing = (folder: string) => readdir(join(root, folder)).catch(() => [] as string[])

describe("switched off, or not a folder site", () => {
  it("asks nothing and writes nothing", async () => {
    expect(await ask({ access: { ...ASKS, folderRequests: false } })).toBeNull()
    expect(await ask({ access: { enabled: false, transport: null, reason: "DISABLED_BY_DEPLOYMENT" } })).toBeNull()
    expect(await listing(OUTBOX)).toEqual([])
  })
})

describe("asking", () => {
  it("drops a request with the patient number in the outbox, and keeps its own record without it", async () => {
    const asked = await ask()
    const id = folderRequestId("inst-1", "IZ", "2026-004512", NOW)
    expect(asked).toEqual({ requestId: id })
    expect(JSON.parse(await readFile(join(root, OUTBOX, `request-${id}.json`), "utf8"))).toEqual({
      formatVersion: 1, kind: "PATIENT_REQUEST", requestId: id, requestedAt: NOW.toISOString(), identifierType: "IZ", identifier: "2026-004512",
    })
    const own = await readFile(join(root, REQUESTS, `${id}.json`), "utf8")
    expect(own).not.toContain("2026-004512")
    expect(await listing(".staging")).toEqual([])
  })

  it("asks once per patient per day, however often it is looked up", async () => {
    await ask()
    // The vendor collected the request; looking up again must not ask again.
    await rm(join(root, OUTBOX), { recursive: true })
    expect(await ask({ now: new Date(NOW.getTime() + 3_600_000) })).not.toBeNull()
    expect(await listing(OUTBOX)).toEqual([])
  })

  it("names each patient's request differently, and never with the number", async () => {
    const one = folderRequestId("inst-1", "IZ", "2026-004512", NOW)
    expect(folderRequestId("inst-1", "IZ", "2026-004513", NOW)).not.toBe(one)
    expect(folderRequestId("inst-1", "EGN", "2026-004512", NOW)).not.toBe(one)
    expect(folderRequestId("inst-1", "IZ", "2026-004512", new Date("2026-10-06T10:00:00Z"))).not.toBe(one)
    expect(one).toMatch(/^[a-f0-9]{32}$/)
  })
})

describe("checking while waiting", () => {
  it("never asks: with nothing asked it answers nothing", async () => {
    expect(await ask({ request: false })).toBeNull()
    expect(await listing(OUTBOX)).toEqual([])
  })

  it("reports a request still waiting", async () => {
    const asked = await ask()
    expect(await ask({ request: false, requestId: asked!.requestId })).toEqual(asked)
  })

  it("finds yesterday's request across midnight, and refuses another patient's id", async () => {
    const asked = await ask({ now: new Date("2026-10-04T23:59:00Z") })
    const afterMidnight = new Date("2026-10-05T00:01:00Z")
    expect(await ask({ request: false, requestId: asked!.requestId, now: afterMidnight })).toEqual(asked)
    // Another patient's real request: its id must not answer for this patient.
    const other = await ask({ identifier: "9999", now: new Date("2026-10-04T23:59:00Z") })
    expect(await ask({ request: false, requestId: other!.requestId, now: afterMidnight })).toBeNull()
  })
})

describe("the answer", () => {
  function client() {
    return {
      ehrImport: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
        create: vi.fn(async () => ({ id: "imp-1" })),
        update: vi.fn(async () => ({})),
      },
      ehrImportField: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })) },
    } as never as EhrImportClient
  }
  async function answer(body: unknown) {
    await mkdir(join(root, INBOX), { recursive: true })
    const path = join(root, INBOX, "answer.json")
    await writeFile(path, JSON.stringify(body))
    const old = new Date(NOW.getTime() - 120_000)
    await utimes(path, old, old)
    await ingestInboxFile(client(), { institutionId: "inst-1", file: "answer.json", root, now: NOW })
  }

  it("is an ordinary inbox file naming the request; once it came, nobody waits", async () => {
    const { requestId } = (await ask())!
    await answer({ identifier: "2026-004512", requestId, fields: { weightKg: 72 } })
    expect(await folderRequestAnswer(requestId, root)).toBe("imported")
    expect(await ask({ request: false, requestId })).toBeNull()
    expect(JSON.parse(await readFile(join(root, "results", "answer.result.json"), "utf8")).requestId).toBe(requestId)
  })

  it("can say the hospital holds nothing, with empty fields", async () => {
    const { requestId } = (await ask())!
    await answer({ identifier: "2026-004512", requestId, fields: {} })
    expect(await folderRequestAnswer(requestId, root)).toBe("rejected")
    expect(await ask({ requestId })).toBeNull()
  })

  it("ignores a requestId that is not one of ours", async () => {
    await answer({ identifier: "2026-004512", requestId: "../../etc", fields: { weightKg: 72 } })
    const report = JSON.parse(await readFile(join(root, "results", "answer.result.json"), "utf8"))
    expect(report).not.toHaveProperty("requestId")
    expect((await listing("results")).filter(name => name.startsWith("answer-"))).toEqual([])
  })
})
