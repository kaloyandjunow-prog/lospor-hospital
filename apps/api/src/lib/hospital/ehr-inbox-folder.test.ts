import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
// The lab code map is read on every ingest, so the mock has to answer for it.
// Empty tables: a site that has configured nothing still stages its files.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    hospitalEhrLabCodeMap: {
      findMany: async () => [],
      upsert: async () => undefined,
    },
  },
}))

import { INBOX } from "./ehr-transport-folder"
import {
  ingestInboxFile,
  PROCESSED,
  REJECTED,
  scanEhrInbox,
} from "./ehr-inbox-folder"
import type { EhrImportClient } from "./ehr-import"

process.env.HOSPITAL_PATIENT_HMAC_KEY ??= Buffer.alloc(32, 1).toString("base64")

/**
 * Reading what a hospital left for us inherits the mirror of the outbox hazard:
 * their writer can be caught mid-file just as easily. We cannot make their
 * write atomic, so the two properties that matter are refusing a file that is
 * still moving, and never letting one bad file stop the scan.
 */

let root = ""
const NOW = new Date("2026-09-02T12:00:00.000Z")
const OLD = new Date(NOW.getTime() - 120_000)

function client() {
  const imports: Record<string, unknown>[] = []
  return {
    imports,
    ehrImport: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        imports.push(args.data)
        return { id: `imp-${imports.length}` }
      }),
      update: vi.fn(async () => ({})),
    },
    ehrImportField: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })) },
  } as never as { imports: Record<string, unknown>[] } & EhrImportClient
}

async function drop(name: string, body: unknown, settled = true) {
  const path = join(root, INBOX, name)
  await writeFile(path, typeof body === "string" ? body : JSON.stringify(body), "utf8")
  if (settled) await utimes(path, OLD, OLD)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "lospor-ehr-inbox-"))
  await mkdir(join(root, INBOX), { recursive: true })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

const good = {
  identifier: "42",
  identifierType: "IZ",
  fields: { diagnoses: [{ code: "K35", label: "Acute appendicitis" }] },
}

describe("a file that is still being written is left alone", () => {
  it("skips one modified a moment ago", async () => {
    // A hospital appending to a file would otherwise be staged half-written as
    // though it were the whole message.
    await drop("fresh.json", good, false)

    const result = await ingestInboxFile(client(), {
      institutionId: "inst-1", file: "fresh.json", root, now: NOW,
    })

    expect(result).toEqual({ file: "fresh.json", outcome: "skipped", reason: "still-being-written" })
  })

  it("leaves it in the inbox to be picked up next pass", async () => {
    await drop("fresh.json", good, false)
    await ingestInboxFile(client(), { institutionId: "inst-1", file: "fresh.json", root, now: NOW })

    expect(await readdir(join(root, INBOX))).toEqual(["fresh.json"])
  })

  it("reads it once it has stopped moving", async () => {
    await drop("settled.json", good)

    const result = await ingestInboxFile(client(), {
      institutionId: "inst-1", file: "settled.json", root, now: NOW,
    })

    expect(result.outcome).toBe("imported")
  })
})

describe("a message that cannot be used is moved aside, not retried forever", () => {
  it("rejects a file that is not JSON", async () => {
    await drop("broken.json", "{not json")

    const result = await ingestInboxFile(client(), {
      institutionId: "inst-1", file: "broken.json", root, now: NOW,
    })

    expect(result).toMatchObject({ outcome: "rejected", reason: "unreadable" })
    expect(await readdir(join(root, REJECTED))).toEqual(["broken.json"])
  })

  it("rejects a message that names no patient", async () => {
    // There is nothing to attach it to, and guessing is not available: the
    // wrong patient's labs is the worst outcome available here.
    await drop("nopatient.json", { fields: { weightKg: 80 } })

    const result = await ingestInboxFile(client(), {
      institutionId: "inst-1", file: "nopatient.json", root, now: NOW,
    })

    expect(result).toMatchObject({ outcome: "rejected", reason: "no-identifier" })
  })

  it("rejects a message with nothing importable in it", async () => {
    // Every field refused by the allow-list, so there is nothing to review.
    await drop("empty.json", { identifier: "42", fields: { clinicalMode: "ADULT" } })

    const result = await ingestInboxFile(client(), {
      institutionId: "inst-1", file: "empty.json", root, now: NOW,
    })

    expect(result).toMatchObject({ outcome: "rejected", reason: "nothing-importable" })
  })

  it("does not leave a rejected file in the inbox", async () => {
    // A directory that fills with files nobody can read is how an integration
    // stops being watched at all.
    await drop("broken.json", "{not json")
    await ingestInboxFile(client(), { institutionId: "inst-1", file: "broken.json", root, now: NOW })

    expect(await readdir(join(root, INBOX))).toEqual([])
  })
})

describe("staging what arrived", () => {
  it("records an import a clinician can review", async () => {
    const db = client()
    await drop("one.json", good)

    const result = await ingestInboxFile(db, {
      institutionId: "inst-1", file: "one.json", root, now: NOW,
    })

    expect(result).toMatchObject({ outcome: "imported", created: true })
    expect(db.imports).toHaveLength(1)
  })

  it("never writes the record number into the staged row", async () => {
    const db = client()
    await drop("one.json", good)
    await ingestInboxFile(db, { institutionId: "inst-1", file: "one.json", root, now: NOW })

    expect(JSON.stringify(db.imports)).not.toContain('"42"')
  })

  it("moves the file out of the inbox once staged", async () => {
    await drop("one.json", good)
    await ingestInboxFile(client(), { institutionId: "inst-1", file: "one.json", root, now: NOW })

    expect(await readdir(join(root, INBOX))).toEqual([])
    expect(await readdir(join(root, PROCESSED))).toEqual(["one.json"])
  })
})

describe("one bad file never stops the scan", () => {
  it("stages the good files and sets the bad one aside", async () => {
    // A hospital dropping a hundred files overnight, one truncated, must still
    // have the other ninety-nine staged by morning.
    const db = client()
    await drop("a.json", good)
    await drop("b.json", "{truncated")
    await drop("c.json", { ...good, identifier: "43" })

    const results = await scanEhrInbox(db, { institutionId: "inst-1", root, now: NOW })

    expect(results.filter(r => r.outcome === "imported")).toHaveLength(2)
    expect(results.filter(r => r.outcome === "rejected")).toHaveLength(1)
  })

  it("ignores files that are not messages", async () => {
    const db = client()
    await drop("a.json", good)
    await writeFile(join(root, INBOX, "README.txt"), "put files here", "utf8")

    const results = await scanEhrInbox(db, { institutionId: "inst-1", root, now: NOW })

    expect(results.map(r => r.file)).toEqual(["a.json"])
  })

  it("creates the inbox rather than failing on a fresh install", async () => {
    const fresh = await mkdtemp(join(tmpdir(), "lospor-ehr-none-"))
    try {
      await expect(scanEhrInbox(client(), { institutionId: "inst-1", root: fresh, now: NOW }))
        .resolves.toEqual([])
    } finally {
      await rm(fresh, { recursive: true, force: true })
    }
  })
})
