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
  // Asked for alongside ServiceRequest, because a hospital records the planned
  // operation as either the order or the booked slot. Empty here so the
  // existing cases keep testing the ServiceRequest path.
  Appointment: { resourceType: "Bundle", entry: [] },
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
/**
 * The proposed fields a pull would stage, by canonical field name.
 *
 * `recorder()` exposes a `staged` array that nothing ever pushes to, so the
 * tests that need the staged content spy on the create call. This is that spy,
 * in one place rather than re-inlined per test.
 */
function captureStaged(client: ReturnType<typeof recorder>["client"]) {
  const fields = new Map<string, unknown>()
  const spy = {
    ...client,
    ehrImport: {
      ...client.ehrImport,
      create: async ({ data }: { data: { fields?: { create?: { fieldKey: string; proposedValue: unknown }[] } } }) => {
        for (const row of data.fields?.create ?? []) {
          const existing = fields.get(row.fieldKey)
          if (Array.isArray(existing)) existing.push(row.proposedValue)
          else if (existing === undefined) fields.set(row.fieldKey, [row.proposedValue])
        }
        return { id: "import-1" }
      },
    },
  }
  return { spy, fields }
}

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

  /**
   * Yielding what arrived is right. Doing it silently is not.
   *
   * A refused Condition fetch and a patient with no diagnoses produce the same
   * empty list on the review screen. For allergies that asymmetry is dangerous:
   * an empty allergy list reads as reassurance, and a clinician who believes it
   * chooses a drug on the strength of a question nobody managed to ask.
   */
  it("says which group it could not read", async () => {
    const { client } = recorder()
    const result = await pullFhirImport(client as never, {
      ...INPUT,
      fetchImpl: server({ AllergyIntolerance: undefined }),
    })

    expect(result).toMatchObject({
      ok: true, unread: [{ group: "allergies", errorCode: "HTTP_404" }],
    })
  })

  // Two resources feed the medication list, and either failing makes it
  // incomplete. The clinician is told once, about medications -- naming the
  // endpoints twice would be noise they cannot act on.
  it("names a group once even when two resources feed it", async () => {
    const { client } = recorder()
    const result = await pullFhirImport(client as never, {
      ...INPUT,
      fetchImpl: server({ MedicationStatement: undefined, MedicationRequest: undefined }),
    })

    expect(result).toMatchObject({ ok: true, unread: [{ group: "medications" }] })
  })

  /**
   * Hospitals record the planned operation as either the surgeon's order or
   * the booked theatre slot, and different systems chose differently. The
   * mapper has read both since it was written; only ServiceRequest was ever
   * requested, so a booking-based site imported no procedure and was told
   * nothing about it.
   */
  /**
   * The role of each diagnosis lives on the stay, not on the Condition. A
   * comorbidity named there goes to the comorbidity list, a billing-only
   * diagnosis is left out, and a condition the stay does not name stays a
   * diagnosis, as it was before roles were read.
   */
  it("sorts diagnoses by the role the admission gives them", async () => {
    const { client } = recorder()
    const { spy, fields } = captureStaged(client)
    const condition = (id: string, code: string, display: string) =>
      ({ resource: { resourceType: "Condition", id, code: { coding: [{ code, display }] } } })
    await pullFhirImport(spy as never, {
      ...INPUT,
      fetchImpl: server({
        Encounter: { resourceType: "Bundle", entry: [{ resource: {
          resourceType: "Encounter", id: "e1",
          diagnosis: [
            { condition: { reference: "Condition/c1" }, use: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/diagnosis-role", code: "AD" }] } },
            { condition: { reference: "Condition/c2" }, use: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/diagnosis-role", code: "CM" }] } },
            { condition: { reference: "Condition/c3" }, use: { coding: [{ system: "https://his.bg/CL076", code: "7" }] } },
          ],
        } }] },
        Condition: { resourceType: "Bundle", entry: [
          condition("c1", "K80.0", "Cholelithiasis"),
          condition("c2", "I10", "Hypertension"),
          condition("c3", "K80.0", "Cholelithiasis, billing"),
          condition("c4", "J45", "Asthma"),
        ] },
      }),
    })

    expect(JSON.stringify(fields.get("diagnoses"))).toContain("Cholelithiasis")
    expect(JSON.stringify(fields.get("diagnoses"))).toContain("Asthma")
    expect(JSON.stringify(fields.get("diagnoses"))).not.toContain("billing")
    expect(JSON.stringify(fields.get("comorbidities"))).toContain("Hypertension")
    expect(JSON.stringify(fields.get("diagnoses"))).not.toContain("Hypertension")
  })

  it("imports a procedure booked as an appointment", async () => {
    const { client } = recorder()
    const { spy, fields } = captureStaged(client)
    await pullFhirImport(spy as never, {
      ...INPUT,
      fetchImpl: server({
        ServiceRequest: { resourceType: "Bundle", entry: [] },
        Appointment: {
          resourceType: "Bundle",
          entry: [{ resource: {
            resourceType: "Appointment", status: "booked",
            serviceType: [{ text: "Laparoscopic cholecystectomy" }],
          } }],
        },
      }),
    })

    expect(JSON.stringify(fields.get("procedures"))).toContain("Laparoscopic cholecystectomy")
  })

  /**
   * A medication is as often a pointer to a Medication resource as a code
   * inline, and several of the largest EHR vendors emit the pointer. Reading
   * only the inline code meant the drug produced no label, and a tag with no
   * label is dropped -- so a patient on eight drugs reached the review screen
   * on none, with nothing to say anything was missing. An empty medication
   * list reads as a fact.
   */
  it("resolves a medication the server returned by reference", async () => {
    const { client } = recorder()
    const { spy, fields } = captureStaged(client)
    await pullFhirImport(spy as never, {
      ...INPUT,
      fetchImpl: server({
        MedicationStatement: {
          resourceType: "Bundle",
          entry: [
            { resource: {
              resourceType: "MedicationStatement", status: "active",
              medicationReference: { reference: "Medication/m1" },
            } },
            { resource: {
              resourceType: "Medication",
              id: "m1", code: { text: "Bisoprolol" },
            }, search: { mode: "include" } },
          ],
        },
      }),
    })

    expect(JSON.stringify(fields.get("currentMedications"))).toContain("Bisoprolol")
  })

  it("says nothing when every group answered", async () => {
    const { client } = recorder()
    const result = await pullFhirImport(client as never, { ...INPUT, fetchImpl: server() })
    expect(result).toMatchObject({ ok: true, unread: [] })
  })

  /**
   * A pull where nothing clinical could be read still succeeds, because the
   * Patient resource itself carried age and sex. That is the right outcome --
   * and it is exactly the case the warning exists for. The screen would
   * otherwise show a tidy demographic proposal and five silently empty
   * clinical lists.
   */
  it("names every group when the whole clinical record was unreadable", async () => {
    const { client } = recorder()
    const result = await pullFhirImport(client as never, {
      ...INPUT,
      fetchImpl: server({
        Observation: undefined, Condition: undefined, AllergyIntolerance: undefined,
        MedicationStatement: undefined, MedicationRequest: undefined, ServiceRequest: undefined,
      }),
    })

    expect(result.ok).toBe(true)
    expect(result.ok && result.unread.map(source => source.group).sort()).toEqual([
      "allergies", "diagnoses", "labs", "medications", "procedures",
    ])
  })

  /**
   * The distinction the whole item turns on.
   *
   * A patient the server answered for, holding nothing, is a real clinical
   * fact. A patient whose every group failed is not a fact at all -- and
   * reporting that as "nothing importable" is how somebody ends up believing
   * an empty record.
   */
  it("does not call an unreadable patient an empty one", async () => {
    const { client } = recorder()
    const anonymous = { resourceType: "Patient", id: "p1", identifier: PATIENT.identifier }
    const result = await pullFhirImport(client as never, {
      ...INPUT,
      fetchImpl: server({
        Patient: { resourceType: "Bundle", entry: [{ resource: anonymous }] },
        Observation: undefined, Condition: undefined, AllergyIntolerance: undefined,
        MedicationStatement: undefined, MedicationRequest: undefined, ServiceRequest: undefined,
      }),
    })

    expect(result).toMatchObject({ ok: false, reason: "unreachable" })
  })
})

/**
 * A patient carries an ЕГН as a national identifier and an ИЗ № as an admission
 * number. They are different namespaces, and verifying one against the other's
 * refuses every correct match — in the shape of a wrong-patient warning, which
 * is the most alarming way to be wrong about something harmless.
 *
 * Invisible until a site configures a namespace, because an unset one skips the
 * check entirely. It would have surfaced the day the first hospital filled it in.
 */
describe("which namespace a search is verified against", () => {
  const PATIENT_WITH = (system: string, value: string) => ({
    resourceType: "Bundle",
    entry: [{ resource: {
      resourceType: "Patient", id: "p1", gender: "female", birthDate: "1974-03-02",
      identifier: [{ system, value }],
    } }],
  })

  it("verifies an ЕГН against the national namespace", async () => {
    const { client } = recorder()
    const result = await pullFhirImport(client as never, {
      ...INPUT,
      identifier: "7403025678",
      identifierType: "EGN",
      recordNumberSystem: "http://hospital.bg/iz",
      nationalIdentifierSystem: "http://hospital.bg/egn",
      fetchImpl: server({ Patient: PATIENT_WITH("http://hospital.bg/egn", "7403025678") }),
    })

    expect(result.ok).toBe(true)
  })

  // The same lookup against the record-number namespace is the bug: a correct
  // match reported as a different patient.
  it("does not verify an ЕГН against the record-number namespace", async () => {
    const { client } = recorder()
    const result = await pullFhirImport(client as never, {
      ...INPUT,
      identifier: "7403025678",
      identifierType: "EGN",
      recordNumberSystem: "http://hospital.bg/iz",
      nationalIdentifierSystem: null,
      fetchImpl: server({ Patient: PATIENT_WITH("http://hospital.bg/egn", "7403025678") }),
    })

    // Nothing configured for ЕГН, so the match is unverified rather than
    // refused — a site must be able to work before it has answered this.
    expect(result.ok).toBe(true)
  })

  it("still verifies a record number against its own namespace", async () => {
    const { client } = recorder()
    const result = await pullFhirImport(client as never, {
      ...INPUT,
      recordNumberSystem: "http://hospital.bg/iz",
      nationalIdentifierSystem: "http://hospital.bg/egn",
      fetchImpl: server({ Patient: PATIENT_WITH("http://hospital.bg/egn", "42") }),
    })

    expect(result).toMatchObject({ ok: false, reason: "wrong-identifier-system" })
  })
})
