import { describe, expect, it } from "vitest"

import {
  EHR_ITEM_SOURCE,
  isImportableField,
  normalizeEhrImport,
  type EhrLabValue,
  type EhrTagValue,
} from "./ehr-import"

const base = { identifierType: "IZ" as const, identifier: "42" }

function normalize(fields: Record<string, unknown>) {
  return normalizeEhrImport({ ...base, fields })
}

function fieldNamed(result: ReturnType<typeof normalize>, name: string) {
  return result.canonical.fields.find(f => f.field === name)
}

describe("what a hospital system is allowed to propose", () => {
  it("refuses clinical mode, whatever it is sent as", () => {
    // The server refuses any write where age and clinical mode disagree, so an
    // importer able to set the mode walks straight into the pediatric-to-adult
    // trap that took three clients to fix. Age may be proposed; the mode it
    // implies is the clinician's decision.
    const result = normalize({ clinicalMode: "PEDIATRIC" })

    expect(result.canonical.fields).toEqual([])
    expect(result.rejected).toEqual([{ field: "clinicalMode", reason: "not-importable" }])
  })

  it("refuses consent", () => {
    // A feed cannot grant consent on a patient's behalf.
    expect(normalize({ aiOptIn: true }).rejected)
      .toEqual([{ field: "aiOptIn", reason: "not-importable" }])
  })

  it("refuses the anaesthetist's own judgement", () => {
    // ASA class and the airway assessment are not the hospital system's to
    // offer, and neither is anything intraoperative.
    const result = normalize({ asaScore: "III", mallampati: "IV", cormackLehane: "I" })

    expect(result.canonical.fields).toEqual([])
    expect(result.rejected.map(r => r.field).sort())
      .toEqual(["asaScore", "cormackLehane", "mallampati"])
  })

  it("accepts age, because the trap is the mode and not the number", () => {
    expect(fieldNamed(normalize({ ageYears: 7 }), "ageYears")).toMatchObject({ value: 7 })
  })

  it("keeps one bad field from discarding a good message", () => {
    // A site integrating for the first time will send things we do not accept.
    // That is a normal event to record, not a reason to drop the labs too.
    const result = normalize({
      clinicalMode: "ADULT",
      diagnoses: [{ label: "Acute appendicitis", code: "K35" }],
    })

    expect(fieldNamed(result, "diagnoses")).toBeDefined()
    expect(result.rejected).toHaveLength(1)
  })

  it("agrees with its own membership test", () => {
    expect(isImportableField("diagnoses")).toBe(true)
    expect(isImportableField("clinicalMode")).toBe(false)
  })
})

describe("provenance is stamped here, not by each transport", () => {
  it("marks every tag as imported", () => {
    const result = normalize({ currentMedications: [{ label: "Warfarin", atcCode: "B01AA03" }] })
    const value = fieldNamed(result, "currentMedications")?.value as EhrTagValue[]

    expect(value[0]).toMatchObject({ label: "Warfarin", atcCode: "B01AA03", source: EHR_ITEM_SOURCE })
  })

  it("marks every lab as imported", () => {
    const result = normalize({
      labResults: [{ test: "Hb", value: "89", unit: "g/L", takenAt: "2026-09-01T08:00:00Z" }],
    })
    const value = fieldNamed(result, "labResults")?.value as EhrLabValue[]

    expect(value[0].source).toBe(EHR_ITEM_SOURCE)
  })
})

describe("a result with no draw time is kept, but marked as undated", () => {
  // Both FHIR and HL7 v2 carry the draw time natively, so it is missing only
  // from a hand-rolled folder drop. Refusing every undated result would
  // silently switch the lab half of the feature off at such a site — so they
  // are kept with a null time and never pre-selected downstream.

  it("keeps it with a null time rather than dropping it", () => {
    const result = normalize({ labResults: [{ test: "Hb", value: "89" }] })
    const value = fieldNamed(result, "labResults")?.value as EhrLabValue[]

    expect(value).toHaveLength(1)
    expect(value[0].takenAt).toBeNull()
  })

  it("never infers the time from when the message arrived", () => {
    // Dating a six-month-old haemoglobin as today is far worse than admitting
    // the date is unknown.
    const result = normalize({ labResults: [{ test: "Hb", value: "89" }] })
    const value = fieldNamed(result, "labResults")?.value as EhrLabValue[]

    expect(value[0].takenAt).not.toEqual(expect.any(String))
  })

  it("counts them, so an integrator can see their feed is missing OBX-14", () => {
    const result = normalize({
      labResults: [
        { test: "Hb", value: "89", takenAt: "2026-09-01T08:00:00Z" },
        { test: "Na", value: "138" },
      ],
    })

    expect(result.undatedLabs).toBe(1)
    // Not a rejection: the value is still offered to the clinician.
    expect(result.rejected).toEqual([])
    expect(fieldNamed(result, "labResults")?.value).toHaveLength(2)
  })

  it("counts nothing when every result is dated", () => {
    const result = normalize({
      labResults: [{ test: "Hb", value: "89", takenAt: "2026-09-01T08:00:00Z" }],
    })

    expect(result.undatedLabs).toBe(0)
  })

  it("keeps two results of one test apart by their time", () => {
    // The whole reason takenAt is required.
    const result = normalize({
      labResults: [
        { test: "Hb", value: "120", takenAt: "2026-08-29T08:00:00Z" },
        { test: "Hb", value: "89", takenAt: "2026-09-01T08:00:00Z" },
      ],
    })
    const value = fieldNamed(result, "labResults")?.value as EhrLabValue[]

    expect(value).toHaveLength(2)
    expect(value.map(v => v.takenAt)).toEqual([
      "2026-08-29T08:00:00.000Z",
      "2026-09-01T08:00:00.000Z",
    ])
  })

  it("treats an unparseable time as no time, rather than rescuing it", () => {
    // Guessing what "12/03" means is how a March result becomes a December one.
    const result = normalize({
      labResults: [{ test: "Hb", value: "89", takenAt: "last tuesday" }],
    })
    const value = fieldNamed(result, "labResults")?.value as EhrLabValue[]

    expect(value[0].takenAt).toBeNull()
    expect(result.undatedLabs).toBe(1)
  })
})

describe("shapes and empties", () => {
  it("keeps an explicit null, because it is a clinical statement", () => {
    // "No known allergies" is something a hospital can say, and it is not the
    // same as saying nothing.
    expect(fieldNamed(normalize({ allergies: null }), "allergies")).toMatchObject({ value: null })
  })

  it("treats saying nothing as nothing", () => {
    expect(normalize({ allergies: undefined }).rejected)
      .toEqual([{ field: "allergies", reason: "empty" }])
  })

  it("refuses a tag list that is not a list", () => {
    expect(normalize({ diagnoses: "K35" }).rejected)
      .toEqual([{ field: "diagnoses", reason: "wrong-shape" }])
  })

  it("drops a tag that names nothing at all", () => {
    const result = normalize({ diagnoses: [{ system: "ICD-10" }] })

    expect(fieldNamed(result, "diagnoses")).toBeUndefined()
    expect(result.rejected).toEqual([{ field: "diagnoses", reason: "empty" }])
  })

  it("keeps a coded tag that has no label", () => {
    // A clinician can read an ICD-10 code; discarding it would lose real
    // information over a cosmetic gap.
    const value = fieldNamed(normalize({ diagnoses: [{ code: "K35" }] }), "diagnoses")
      ?.value as EhrTagValue[]

    expect(value[0]).toMatchObject({ label: "K35", code: "K35" })
  })

  it("carries the message id through for tracing", () => {
    const result = normalizeEhrImport({
      ...base, sourceMessageId: "MSG-7", fields: { ageYears: 40 },
    })

    expect(result.canonical.sourceMessageId).toBe("MSG-7")
    expect(result.canonical.identifier).toEqual({ type: "IZ", value: "42" })
  })
})
