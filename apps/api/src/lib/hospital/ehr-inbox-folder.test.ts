import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises"
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
  checkInboxDocument,
  ehrInboxHealth,
  INBOX_MAX_BYTES,
  ingestInboxFile,
  PROCESSED,
  REJECTED,
  RESULTS,
  resultFileName,
  scanEhrInbox,
} from "./ehr-inbox-folder"
import type { EhrImportClient } from "./ehr-import"
import { EHR_IMPORTABLE_FIELDS } from "@lospor/core/ehr-import"
import { CLINICAL_ENUM_RULES } from "@lospor/core/clinical-validation"

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

const report = async (name: string) => JSON.parse(await readFile(join(root, RESULTS, resultFileName(name)), "utf8"))

describe("the published format (1.5.0)", () => {
  const lab = { test: "Hemoglobin", value: "130", unit: "g/L", takenAt: "2026-09-01T08:00:00Z" }

  it("stages lab results under labResults, the name every other transport uses", async () => {
    await drop("labs.json", { identifier: "42", fields: { labResults: [lab] } })
    const result = await ingestInboxFile(client(), { institutionId: "inst-1", file: "labs.json", root, now: NOW })
    expect(result.outcome).toBe("imported")
    expect((await report("labs.json")).fields.accepted).toEqual(["labResults"])
  })

  it("still reads labs, the name this reader documented first", async () => {
    // Before 1.5.0 a file using `labs` was refused whole as nothing importable.
    await drop("old.json", { identifier: "42", fields: { labs: [lab] } })
    const result = await ingestInboxFile(client(), { institutionId: "inst-1", file: "old.json", root, now: NOW })
    expect(result.outcome).toBe("imported")
    expect((await report("old.json")).labs).toMatchObject({ received: 1, undated: 0 })
  })

  it("reads a file that starts with a byte-order mark", async () => {
    await drop("bom.json", `﻿${JSON.stringify(good)}`)
    const result = await ingestInboxFile(client(), { institutionId: "inst-1", file: "bom.json", root, now: NOW })
    expect(result.outcome).toBe("imported")
  })

  it("refuses an identifier type it does not know instead of reading it as ИЗ", async () => {
    for (const [name, identifierType] of [["cyr.json", "ЕГН"], ["typo.json", "EGNN"], ["num.json", 1]] as const) {
      await drop(name, { ...good, identifierType })
      const result = await ingestInboxFile(client(), { institutionId: "inst-1", file: name, root, now: NOW })
      expect(result).toMatchObject({ outcome: "rejected", reason: "unknown-identifier-type" })
    }
  })

  it("reads IZ when no type is given, and either type in any case", async () => {
    const db = client()
    await drop("none.json", { identifier: "42", fields: good.fields })
    await drop("egn.json", { ...good, identifierType: " egn " })
    await ingestInboxFile(db, { institutionId: "inst-1", file: "none.json", root, now: NOW })
    await ingestInboxFile(db, { institutionId: "inst-1", file: "egn.json", root, now: NOW })
    expect(db.imports.map(row => row.identifierType)).toEqual(["IZ", "EGN"])
  })

  it("refuses a format version it does not know", async () => {
    await drop("v2.json", { ...good, formatVersion: 2 })
    const result = await ingestInboxFile(client(), { institutionId: "inst-1", file: "v2.json", root, now: NOW })
    expect(result).toMatchObject({ outcome: "rejected", reason: "unsupported-format-version" })
  })

  it("refuses a file too large to be one patient's data, unread", async () => {
    await drop("big.json", `{"identifier":"42","pad":"${"x".repeat(INBOX_MAX_BYTES)}"}`)
    const result = await ingestInboxFile(client(), { institutionId: "inst-1", file: "big.json", root, now: NOW })
    expect(result).toMatchObject({ outcome: "rejected", reason: "too-large" })
  })
})

describe("every file read gets an answer the hospital's team can open (1.5.0)", () => {
  it("says what was taken, what was ignored and why, and which keys it does not know", async () => {
    await drop("mixed.json", {
      identifier: "42", identifierType: "IZ", sourceMessageId: "HIS-77", patientName: "x",
      fields: { weightKg: 80, clinicalMode: "ADULT", diagnoses: "K35" },
    })
    await ingestInboxFile(client(), { institutionId: "inst-1", file: "mixed.json", root, now: NOW })
    expect(await report("mixed.json")).toMatchObject({
      formatVersion: 1, file: "mixed.json", outcome: "imported", sourceMessageId: "HIS-77", identifierType: "IZ",
      checkedAt: NOW.toISOString(),
      fields: { accepted: ["weightKg"], ignored: [{ field: "clinicalMode", reason: "not-importable" }, { field: "diagnoses", reason: "wrong-shape" }] },
      unknownKeys: ["patientName"],
    })
  })

  it("says why a file was refused", async () => {
    await drop("broken.json", "{not json")
    await ingestInboxFile(client(), { institutionId: "inst-1", file: "broken.json", root, now: NOW })
    expect(await report("broken.json")).toMatchObject({ outcome: "rejected", reason: "unreadable" })
  })

  it("never writes the patient number into the answer", async () => {
    await drop("one.json", { ...good, identifier: "8701011234" })
    await ingestInboxFile(client(), { institutionId: "inst-1", file: "one.json", root, now: NOW })
    expect(await readFile(join(root, RESULTS, resultFileName("one.json")), "utf8")).not.toContain("8701011234")
  })

  it("writes no answer for a file still being written", async () => {
    await drop("fresh.json", good, false)
    await ingestInboxFile(client(), { institutionId: "inst-1", file: "fresh.json", root, now: NOW })
    await expect(readdir(join(root, RESULTS))).rejects.toThrow()
  })
})

describe("checking a file without importing it (1.5.0)", () => {
  it("reports what the inbox would do, and stages, moves and records nothing", async () => {
    const result = await checkInboxDocument(JSON.stringify({ ...good, typo: 1 }), { file: "sample.json", now: NOW })
    expect(result).toMatchObject({ outcome: "would-import", file: "sample.json", fields: { accepted: ["diagnoses"] }, unknownKeys: ["typo"] })
    expect(JSON.stringify(result)).not.toContain('"42"')
    expect(await readdir(join(root, INBOX))).toEqual([])
  })

  it("gives the same refusal the inbox would", async () => {
    expect(await checkInboxDocument(JSON.stringify({ fields: {} }), { now: NOW })).toMatchObject({ outcome: "rejected", reason: "no-identifier" })
  })
})

describe("folder health for Status (1.5.0)", () => {
  it("counts waiting files, the last day's outcomes and the latest refusals", async () => {
    // A refusal from two days ago is outside the day but still among the latest.
    await drop("old.json", "{old")
    const twoDaysAgo = new Date(NOW.getTime() - 49 * 3_600_000)
    await utimes(join(root, INBOX, "old.json"), twoDaysAgo, twoDaysAgo)
    await scanEhrInbox(client(), { institutionId: "inst-1", root, now: new Date(NOW.getTime() - 48 * 3_600_000) })
    await drop("a.json", good)
    await drop("b.json", "{truncated")
    await scanEhrInbox(client(), { institutionId: "inst-1", root, now: NOW })
    await drop("waiting.json", good)

    const health = await ehrInboxHealth({ root, now: new Date(NOW.getTime() + 60_000) })
    expect(health).toEqual({
      waiting: 1,
      oldestWaitingSeconds: 180,
      lastReadAt: NOW.toISOString(),
      last24h: { imported: 1, rejected: 1 },
      recentRejections: [
        { file: "b.json", reason: "unreadable", at: NOW.toISOString() },
        { file: "old.json", reason: "unreadable", at: new Date(NOW.getTime() - 48 * 3_600_000).toISOString() },
      ],
    })
  })

  it("answers on a fresh install with nothing in any folder", async () => {
    const fresh = await mkdtemp(join(tmpdir(), "lospor-ehr-health-"))
    try {
      expect(await ehrInboxHealth({ root: fresh, now: NOW })).toEqual({
        waiting: 0, oldestWaitingSeconds: null, lastReadAt: null, last24h: { imported: 0, rejected: 0 }, recentRejections: [],
      })
    } finally {
      await rm(fresh, { recursive: true, force: true })
    }
  })
})

describe("dropped lab results go through the site's lab mapping (1.5.0)", () => {
  it("reports a test name the site has not mapped, under either field name", async () => {
    for (const key of ["labResults", "labs"]) {
      const name = `${key}.json`
      await drop(name, { identifier: "42", fields: { [key]: [{ test: "ХГБ-местен", value: "130", unit: "g/L", takenAt: "2026-09-01T08:00:00Z" }] } })
      await ingestInboxFile(client(), { institutionId: "inst-1", file: name, root, now: NOW })
      expect((await report(name)).labs.unmappedCodes).toEqual([expect.objectContaining({ display: "ХГБ-местен" })])
    }
  })
})

describe("dropped lab results are staged under LOSPOR's names (1.5.0)", () => {
  it("names a result LOSPOR knows by its own test name, keeping what the laboratory called it", async () => {
    for (const key of ["labResults", "labs"]) {
      const db = client()
      const name = `named-${key}.json`
      await drop(name, { identifier: "42", fields: { [key]: [{ test: "Hemoglobin", value: "130", unit: "g/L", takenAt: "2026-09-01T08:00:00Z" }] } })
      await ingestInboxFile(db, { institutionId: "inst-1", file: name, root, now: NOW })
      const staged = (db.imports[0] as { fields: { create: { proposedValue: Record<string, unknown> }[] } }).fields.create[0].proposedValue
      expect(staged).toMatchObject({ test: "Haemoglobin (Hb)", reportedTest: "Hemoglobin" })
    }
  })
})

describe("single values are checked against the form's own rules (1.5.0)", () => {
  it("normalises what the form accepts and ignores, with a reason, what it would refuse", async () => {
    const db = client()
    await drop("values.json", {
      identifier: "42",
      fields: {
        sex: "female", bloodType: "ab", rhFactor: "Positive", weightKg: "72,5", heartRate: 80, allergies: false,
        heightCm: "tall", ageUnit: "WEEKS", latexAllergy: "no", spO2: "98%",
      },
    })
    await ingestInboxFile(db, { institutionId: "inst-1", file: "values.json", root, now: NOW })

    const staged = Object.fromEntries((db.imports[0] as { fields: { create: { fieldKey: string; proposedValue: unknown }[] } })
      .fields.create.map(row => [row.fieldKey, row.proposedValue]))
    expect(staged).toEqual({ sex: "FEMALE", bloodType: "AB", rhFactor: "POSITIVE", weightKg: 72.5, heartRate: 80, allergies: false })
    expect((await report("values.json")).fields.ignored).toEqual(expect.arrayContaining([
      { field: "heightCm", reason: "invalid-value" },
      { field: "ageUnit", reason: "invalid-value" },
      { field: "latexAllergy", reason: "invalid-value" },
      { field: "spO2", reason: "invalid-value" },
    ]))
  })

  it("keeps a stated null: no known allergies is a statement", async () => {
    const db = client()
    await drop("nka.json", { identifier: "42", fields: { allergies: null, weightKg: 70 } })
    await ingestInboxFile(db, { institutionId: "inst-1", file: "nka.json", root, now: NOW })
    expect((await report("nka.json")).fields.accepted).toEqual(["allergies", "weightKg"])
  })
})

describe("the published guide and its examples stay true (1.5.0)", () => {
  const docs = join(process.cwd(), "..", "..", "docs")

  it("stages both example files whole: nothing ignored, nothing unknown", async () => {
    for (const name of ["example-admission.json", "example-minimal.json"]) {
      await drop(name, await readFile(join(docs, "ehr-folder", name), "utf8"))
      const result = await ingestInboxFile(client(), { institutionId: "inst-1", file: name, root, now: NOW })
      expect(result.outcome, name).toBe("imported")
      const answer = await report(name)
      expect(answer.fields.ignored, name).toEqual([])
      expect(answer.unknownKeys, name).toEqual([])
    }
  })

  it("documents exactly the fields the reader takes, in both languages", async () => {
    for (const guide of ["ehr-folder-format.md", "ehr-folder-format.bg.md"]) {
      const text = await readFile(join(docs, guide), "utf8")
      const table = text.slice(text.indexOf("### "), text.indexOf("### ", text.indexOf("### ") + 4))
      const documented = new Set([...table.matchAll(/^\| ([^|]+) \|/gm)].flatMap(row => [...row[1].matchAll(/`([a-zA-Z0-9]+)`/g)].map(name => name[1])))
      expect([...documented].sort(), guide).toEqual(Object.keys(EHR_IMPORTABLE_FIELDS).sort())
    }
  })
})

describe("the published JSON Schema stays true (1.5.0)", () => {
  it("names exactly the fields the reader takes, with the form's own words", async () => {
    const schema = JSON.parse(await readFile(join(process.cwd(), "..", "..", "docs", "ehr-folder", "inbox-v1.schema.json"), "utf8"))
    const fields = schema.properties.fields.properties
    expect(Object.keys(fields).sort()).toEqual(Object.keys(EHR_IMPORTABLE_FIELDS).sort())
    for (const field of ["sex", "bloodType", "rhFactor", "ageUnit"]) {
      expect(fields[field].enum.filter((value: unknown) => value !== null), field).toEqual(CLINICAL_ENUM_RULES.preop[field])
    }
    expect(schema.properties.identifierType.enum).toEqual(["IZ", "EGN"])
    expect(schema.properties.formatVersion.const).toBe(1)
  })
})
