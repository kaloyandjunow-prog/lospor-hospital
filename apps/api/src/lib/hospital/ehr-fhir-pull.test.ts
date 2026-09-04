import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("./ehr-lab-code-map", () => ({
  siteLabCodeMap: async () => ({}),
  assumedUnits: async () => ({}),
  recordUnmappedCodes: async () => undefined,
}))

process.env.HOSPITAL_PATIENT_HMAC_KEY ??= Buffer.alloc(32, 1).toString("base64")

import { pullFhirImport } from "./ehr-fhir-pull"

/**
 * The pull is the whole point of the FHIR receive path, so this exercises it
 * against a server that answers every resource type — the case that used to
 * return labs and nothing else.
 */

const PATIENT = {
  resourceType: "Patient", id: "p1", gender: "female", birthDate: "1974-03-02",
  identifier: [{ system: "http://hospital.bg/iz", value: "42" }],
}

const RESPONSES: Record<string, unknown> = {
  Patient: { resourceType: "Bundle", entry: [{ resource: PATIENT }] },
  Observation: {
    resourceType: "Bundle",
    entry: [
      { resource: { resourceType: "Observation", status: "final", code: { coding: [{ system: "http://loinc.org", code: "8302-2" }] }, valueQuantity: { value: 164, code: "cm" } } },
      { resource: { resourceType: "Observation", status: "final", code: { coding: [{ system: "http://loinc.org", code: "29463-7" }] }, valueQuantity: { value: 71, code: "kg" } } },
      { resource: { resourceType: "Observation", status: "final", code: { coding: [{ system: "http://loinc.org", code: "718-7" }] }, valueQuantity: { value: 118, code: "g/L" }, effectiveDateTime: "2026-09-03T07:10:00Z" } },
    ],
  },
  Condition: {
    resourceType: "Bundle",
    entry: [{ resource: { resourceType: "Condition", code: { coding: [{ code: "I10", display: "Hypertension" }] } } }],
  },
  AllergyIntolerance: {
    resourceType: "Bundle",
    entry: [{ resource: { resourceType: "AllergyIntolerance", code: { coding: [{ code: "372687004", display: "Amoxicillin" }] } } }],
  },
  MedicationStatement: {
    resourceType: "Bundle",
    entry: [{ resource: { resourceType: "MedicationStatement", status: "active", medicationCodeableConcept: { text: "Ramipril" }, dosage: [{ text: "5 mg daily" }] } }],
  },
  MedicationRequest: { resourceType: "Bundle", entry: [] },
  ServiceRequest: {
    resourceType: "Bundle",
    entry: [{ resource: { resourceType: "ServiceRequest", status: "active", code: { text: "Laparoscopic cholecystectomy" } } }],
  },
}

function server(overrides: Record<string, unknown> = {}): typeof fetch {
  return (async (url: string) => {
    const type = new URL(url).pathname.split("/").pop() ?? ""
    const body = type in overrides ? overrides[type] : RESPONSES[type]
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => body }
  }) as unknown as typeof fetch
}

/** Captures what would be staged, without a database. */
function recorder() {
  const staged: { canonical: { fields: { field: string; value: unknown }[] } }[] = []
  const client = {
    ehrImport: {
      findFirst: async () => null,
      create: async ({ data }: { data: unknown }) => ({ id: "import-1", ...(data as object) }),
    },
    ehrImportField: { createMany: async () => ({ count: 0 }) },
    $transaction: async (fn: unknown) => (fn as (c: unknown) => unknown)(client),
  }
  return { staged, client }
}

const INPUT = {
  institutionId: "inst-1",
  endpoint: "https://fhir.example.org/r4",
  credential: "token",
  identifier: "42",
  identifierType: "IZ" as const,
  now: new Date("2026-09-04T08:00:00Z"),
}

describe("pulling a whole patient, not just their labs", () => {
  it("brings back every field the closed list allows", async () => {
    // The gap this closes: only Observation had a reader, so a FHIR site
    // imported labs and nothing else — no age, no diagnoses, no medications.
    const { client } = recorder()
    let captured: { field: string }[] = []
    const spy = {
      ...client,
      ehrImport: {
        ...client.ehrImport,
        create: async ({ data }: { data: { fields?: { create?: { fieldKey: string }[] } } }) => {
          captured = (data.fields?.create ?? []).map(row => ({ field: row.fieldKey }))
          return { id: "import-1" }
        },
      },
    }

    const result = await pullFhirImport(spy as never, { ...INPUT, fetchImpl: server() })

    expect(result.ok).toBe(true)
    const fields = new Set(captured.map(row => row.field))
    expect(fields).toContain("sex")
    expect(fields).toContain("heightCm")
    expect(fields).toContain("weightKg")
    expect(fields).toContain("diagnoses")
    expect(fields).toContain("currentMedications")
    expect(fields).toContain("allergyDetails")
    expect(fields).toContain("allergies")
    expect(fields).toContain("procedures")
    expect(fields).toContain("labResults")
    expect(fields).toContain("ageValue")
  })

  it("refuses a record number that matches two patients", async () => {
    const { client } = recorder()
    const two = { resourceType: "Bundle", entry: [{ resource: PATIENT }, { resource: { ...PATIENT, id: "p2" } }] }
    const result = await pullFhirImport(client as never, {
      ...INPUT, fetchImpl: server({ Patient: two }),
    })
    expect(result).toEqual({ ok: false, reason: "ambiguous" })
  })

  it("says unreachable rather than not-found when the server is down", async () => {
    const { client } = recorder()
    const down = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch
    const result = await pullFhirImport(client as never, { ...INPUT, fetchImpl: down })
    expect(result).toMatchObject({ ok: false, reason: "unreachable" })
  })

  it("still yields the labs when one resource type is refused", async () => {
    // A server serving Observations but refusing Conditions must not lose the
    // whole pull: the clinician is offered what actually arrived.
    const { client } = recorder()
    let captured: { field: string }[] = []
    const spy = {
      ...client,
      ehrImport: {
        ...client.ehrImport,
        create: async ({ data }: { data: { fields?: { create?: { fieldKey: string }[] } } }) => {
          captured = (data.fields?.create ?? []).map(row => ({ field: row.fieldKey }))
          return { id: "import-1" }
        },
      },
    }

    const result = await pullFhirImport(spy as never, {
      ...INPUT,
      fetchImpl: server({ Condition: undefined }),
    })

    expect(result.ok).toBe(true)
    const fields = new Set(captured.map(row => row.field))
    expect(fields).toContain("labResults")
    expect(fields).not.toContain("diagnoses")
  })
})
