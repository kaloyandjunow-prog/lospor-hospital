import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { normalizeEhrImport } from "@lospor/core/ehr-import"

import {
  ehrPayloadHash,
  ehrReviewPlanFor,
  findPendingEhrImport,
  recordEhrDecisions,
  recordEhrImport,
  type EhrImportClient,
} from "./ehr-import"

process.env.HOSPITAL_PATIENT_HMAC_KEY ??= Buffer.alloc(32, 1).toString("base64")

/**
 * The appliance half of receiving an import. What is worth pinning here is not
 * that rows are written — it is the three properties that make the review
 * trustworthy: a redelivered message does not become a second thing to read, a
 * refusal survives into later messages, and nothing clinical is written by any
 * of it.
 */

const NOW = new Date("2026-09-02T09:00:00Z")

function canonical(fields: Record<string, unknown>, sourceMessageId?: string) {
  return normalizeEhrImport({
    identifierType: "IZ", identifier: "42", sourceMessageId, fields,
  }).canonical
}

type Row = Record<string, unknown>

function client(seed: { imports?: Row[]; fields?: Row[] } = {}) {
  const imports: Row[] = seed.imports ?? []
  const fields: Row[] = seed.fields ?? []
  let nextId = 1

  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, want]) => {
      const have = row[key]
      if (want && typeof want === "object" && !Array.isArray(want)) {
        const clause = want as Record<string, unknown>
        if ("gt" in clause) return (have as Date) > (clause.gt as Date)
        if ("in" in clause) return (clause.in as unknown[]).includes(have)
      }
      return have === want
    })

  const db = {
    imports,
    fields,
    ehrImport: {
      findFirst: vi.fn(async (args: { where: Row }) => {
        const found = imports.filter(row => matches(row, args.where))
        found.sort((a, b) =>
          (b.receivedAt as Date).getTime() - (a.receivedAt as Date).getTime())
        if (!found[0]) return null
        return { ...found[0], fields: fields.filter(f => f.importId === found[0].id) }
      }),
      findMany: vi.fn(async (args: { where: Row }) =>
        imports.filter(row => matches(row, args.where))),
      create: vi.fn(async (args: { data: Row }) => {
        const id = `imp-${nextId++}`
        const { fields: nested, ...rest } = args.data as Row & { fields?: { create: Row[] } }
        // The schema defaults status to PENDING; a fake that omits it would
        // make every "is this still waiting" query silently miss.
        imports.push({ id, status: "PENDING", ...rest })
        for (const field of nested?.create ?? []) {
          fields.push({ id: `f-${fields.length + 1}`, importId: id, status: "PENDING", ...field })
        }
        return { id }
      }),
      update: vi.fn(async (args: { where: Row; data: Row }) => {
        const row = imports.find(r => r.id === args.where.id)!
        Object.assign(row, args.data)
        return row
      }),
    },
    ehrImportField: {
      findMany: vi.fn(async (args: { where: Row }) =>
        fields.filter(row => matches(row, args.where))),
      updateMany: vi.fn(async (args: { where: Row; data: Row }) => {
        const hit = fields.filter(row => matches(row, args.where))
        for (const row of hit) Object.assign(row, args.data)
        return { count: hit.length }
      }),
    },
  }
  // The fake's argument types are narrower than the client interface, which
  // takes `unknown` so it can accept a Prisma transaction client.
  return db as typeof db & EhrImportClient
}

const base = {
  institutionId: "inst-1",
  identifier: "42",
  identifierType: "IZ" as const,
  transport: "FOLDER" as const,
  now: NOW,
}

describe("a redelivered message is not a second thing to read", () => {
  // Folders get rescanned, HL7 senders retry without an acknowledgement, a
  // nightly drop repeats yesterday's file. None of that may put the same
  // proposals in front of a clinician twice.

  it("returns the existing import instead of creating another", async () => {
    const db = client()
    const payload = canonical({ weightKg: 80 })

    const first = await recordEhrImport(db, { ...base, canonical: payload })
    const second = await recordEhrImport(db, { ...base, canonical: payload })

    expect(first.created).toBe(true)
    expect(second).toEqual({ id: first.id, created: false })
    expect(db.imports).toHaveLength(1)
  })

  it("keys on what the message says, not what the sender calls it", async () => {
    // Same content, different filename or HL7 control id: still one import.
    expect(ehrPayloadHash(canonical({ weightKg: 80 }, "file-a.json")))
      .toBe(ehrPayloadHash(canonical({ weightKg: 80 }, "MSG-00042")))
  })

  it("treats genuinely different content as a new import", async () => {
    const db = client()
    await recordEhrImport(db, { ...base, canonical: canonical({ weightKg: 80 }) })
    await recordEhrImport(db, { ...base, canonical: canonical({ weightKg: 81 }) })

    expect(db.imports).toHaveLength(2)
  })
})

describe("finding what is waiting for a patient", () => {
  it("finds it by the number the clinician types, which is never stored", async () => {
    const db = client()
    await recordEhrImport(db, { ...base, canonical: canonical({ weightKg: 80 }) })

    const found = await findPendingEhrImport(db, {
      institutionId: "inst-1", identifier: "42", identifierType: "IZ", now: NOW,
    })

    expect(found?.maskedIdentifier).toBeDefined()
    expect(JSON.stringify(db.imports)).not.toContain('"42"')
  })

  it("does not offer an expired import", async () => {
    // There is no scheduler in the appliance, so expiry is a predicate rather
    // than a job that may or may not have run.
    const db = client()
    await recordEhrImport(db, { ...base, canonical: canonical({ weightKg: 80 }) })

    const later = new Date(NOW.getTime() + 15 * 86_400_000)
    expect(await findPendingEhrImport(db, {
      institutionId: "inst-1", identifier: "42", identifierType: "IZ", now: later,
    })).toBeNull()
  })

  it("does not cross institutions", async () => {
    const db = client()
    await recordEhrImport(db, { ...base, canonical: canonical({ weightKg: 80 }) })

    expect(await findPendingEhrImport(db, {
      institutionId: "inst-2", identifier: "42", identifierType: "IZ", now: NOW,
    })).toBeNull()
  })
})

describe("the plan is rebuilt against the case as it stands", () => {
  async function staged(fields: Record<string, unknown>) {
    const db = client()
    const { id } = await recordEhrImport(db, { ...base, canonical: canonical(fields) })
    return { db, id }
  }

  it("does not re-offer a value the case already has", async () => {
    // The case moves while an import waits. A stored plan would go on offering
    // values that are already there.
    const { db, id } = await staged({ weightKg: 80 })

    const result = await ehrReviewPlanFor(db, {
      importId: id, institutionId: "inst-1", current: { weightKg: 80 }, now: NOW,
    })

    expect(result?.plan.items[0].state).toBe("unchanged")
    expect(result?.plan.preselectedKeys).toEqual([])
  })

  it("offers it when the case is empty", async () => {
    const { db, id } = await staged({ weightKg: 80 })

    const result = await ehrReviewPlanFor(db, {
      importId: id, institutionId: "inst-1", current: {}, now: NOW,
    })

    expect(result?.plan.preselectedKeys).toEqual(["weightKg"])
  })

  it("still refuses an age that would change the clinical mode", async () => {
    // The guard has to survive the round trip through the database, not just
    // hold in Core.
    const { db, id } = await staged({ ageYears: 7 })

    const result = await ehrReviewPlanFor(db, {
      importId: id, institutionId: "inst-1", current: {},
      currentClinicalMode: "ADULT", now: NOW,
    })

    expect(result?.plan.items[0].state).toBe("needs-mode-decision")
    expect(result?.plan.preselectedKeys).toEqual([])
  })

  it("rebuilds tag and lab shapes, not just scalars", async () => {
    const { db, id } = await staged({
      diagnoses: [{ code: "K35", label: "Acute appendicitis" }],
      labResults: [{ test: "Haemoglobin (Hb)", unit: "g/L", value: "89", takenAt: "2026-09-01T08:00:00Z" }],
    })

    const result = await ehrReviewPlanFor(db, {
      importId: id, institutionId: "inst-1", current: {}, now: NOW,
    })

    expect(result?.plan.preselectedKeys.sort()).toEqual([
      "diagnoses|k35",
      "labResults|haemoglobin (hb)|2026-09-01T08:00:00.000Z|89",
    ])
  })

  it("will not build a plan for another institution's import", async () => {
    const { db, id } = await staged({ weightKg: 80 })

    expect(await ehrReviewPlanFor(db, {
      importId: id, institutionId: "inst-2", current: {}, now: NOW,
    })).toBeNull()
  })
})

describe("a refusal outlives the message it arrived in", () => {
  it("is not offered again by a later import", async () => {
    // Re-proposing a diagnosis somebody rejected last week, because it came in
    // a different file this week, is what teaches people to tick without
    // reading — the one failure that makes the review worthless.
    const db = client()
    const first = await recordEhrImport(db, {
      ...base, canonical: canonical({ diagnoses: [{ code: "K35", label: "Acute appendicitis" }] }),
    })
    await recordEhrDecisions(db, {
      importId: first.id, institutionId: "inst-1",
      acceptedKeys: [], declinedKeys: ["diagnoses|k35"], userId: "user-1", now: NOW,
    })

    const second = await recordEhrImport(db, {
      ...base,
      canonical: canonical({ diagnoses: [{ code: "K35", label: "Acute appendicitis (relabelled)" }] }),
    })
    const result = await ehrReviewPlanFor(db, {
      importId: second.id, institutionId: "inst-1", current: {}, now: NOW,
    })

    expect(result?.plan.items[0].state).toBe("declined")
    expect(result?.plan.preselectedKeys).toEqual([])
  })

  it("does not silence a different item in the same message", async () => {
    const db = client()
    const { id } = await recordEhrImport(db, {
      ...base,
      canonical: canonical({
        diagnoses: [
          { code: "K35", label: "Acute appendicitis" },
          { code: "I10", label: "Hypertension" },
        ],
      }),
    })
    await recordEhrDecisions(db, {
      importId: id, institutionId: "inst-1",
      acceptedKeys: [], declinedKeys: ["diagnoses|k35"], userId: "user-1", now: NOW,
    })

    const result = await ehrReviewPlanFor(db, {
      importId: id, institutionId: "inst-1", current: {}, now: NOW,
    })

    expect(result?.plan.preselectedKeys).toEqual(["diagnoses|i10"])
  })
})

describe("recording a decision writes nothing clinical", () => {
  it("marks fields decided and leaves the case alone", async () => {
    // The accepted values reach the record through the ordinary case PATCH by
    // the clinician. This only stops them being offered again.
    const db = client()
    const { id } = await recordEhrImport(db, {
      ...base, canonical: canonical({ weightKg: 80, heightCm: 175 }),
    })

    const result = await recordEhrDecisions(db, {
      importId: id, institutionId: "inst-1",
      acceptedKeys: ["weightKg"], declinedKeys: ["heightCm"], userId: "user-1", now: NOW,
    })

    expect(result).toEqual({ accepted: 1, declined: 1, closed: true })
    expect(db.fields.map(f => f.status).sort()).toEqual(["ACCEPTED", "REJECTED"])
  })

  it("keeps the import open while anything is still undecided", async () => {
    // A clinician who takes two values now must find the rest still waiting.
    const db = client()
    const { id } = await recordEhrImport(db, {
      ...base, canonical: canonical({ weightKg: 80, heightCm: 175 }),
    })

    const result = await recordEhrDecisions(db, {
      importId: id, institutionId: "inst-1",
      acceptedKeys: ["weightKg"], declinedKeys: [], userId: "user-1", now: NOW,
    })

    expect(result.closed).toBe(false)
    expect(db.imports[0].status).toBe("PENDING")
  })

  it("closes the import once nothing is left", async () => {
    const db = client()
    const { id } = await recordEhrImport(db, { ...base, canonical: canonical({ weightKg: 80 }) })

    await recordEhrDecisions(db, {
      importId: id, institutionId: "inst-1",
      acceptedKeys: ["weightKg"], declinedKeys: [], userId: "user-1", now: NOW,
    })

    expect(db.imports[0].status).toBe("REVIEWED")
    expect(db.imports[0].reviewedById).toBe("user-1")
  })

  it("refuses an import belonging to another institution", async () => {
    const db = client()
    const { id } = await recordEhrImport(db, { ...base, canonical: canonical({ weightKg: 80 }) })

    await expect(recordEhrDecisions(db, {
      importId: id, institutionId: "inst-2",
      acceptedKeys: ["weightKg"], declinedKeys: [], userId: "user-1", now: NOW,
    })).rejects.toThrow("EHR_IMPORT_NOT_FOUND")
  })

  it("lets a failure between the patch and the decision heal itself", async () => {
    // The client applies the patch first, then records. If it dies in between,
    // the import stays PENDING and the same proposal is shown again — but the
    // value is now in the case, so it comes back `unchanged` and disappears on
    // its own. The reverse order would record a decision for a value that
    // never landed, which is silent clinical data loss.
    const db = client()
    const { id } = await recordEhrImport(db, { ...base, canonical: canonical({ weightKg: 80 }) })

    // Patch applied, decision never recorded.
    const result = await ehrReviewPlanFor(db, {
      importId: id, institutionId: "inst-1", current: { weightKg: 80 }, now: NOW,
    })

    expect(db.imports[0].status).toBe("PENDING")
    expect(result?.plan.items[0].state).toBe("unchanged")
    expect(result?.plan.preselectedKeys).toEqual([])
  })
})
