import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import {
  codeSystemKey,
  isCodeList,
  NO_CODE_SYSTEM_ANSWERS,
  unrecognisedCodeSystems,
  withAnsweredLabCodings,
  type CodeSystemAnswers,
} from "./ehr-code-systems"
import { fhirCodeSystemsSeen, mapFhirMedications, mapFhirPlannedProcedures } from "./ehr-fhir-clinical"
import { resolveImportedDiagnoses } from "./ehr-icd10"

const vendor: CodeSystemAnswers = new Map([
  ["http://vendor.bg/lists/proc", "KSMP"],
  ["http://vendor.bg/lists/route", "NHIS_CL013"],
  ["http://vendor.bg/lists/dx", "ICD10"],
  ["http://vendor.bg/lists/lab", "NHIS_CL024"],
] as const)

describe("an address recognised by its name", () => {
  it("needs no answer when it names the list as a segment", () => {
    expect(isCodeList("urn:nhis:CL013", "NHIS_CL013", NO_CODE_SYSTEM_ANSWERS)).toBe(true)
    expect(isCodeList("urn:bg:КСМП", "KSMP", NO_CODE_SYSTEM_ANSWERS)).toBe(true)
    expect(isCodeList("https://his.bg/МКБ-10", "ICD10", NO_CODE_SYSTEM_ANSWERS)).toBe(true)
    expect(isCodeList("http://hl7.org/fhir/sid/icd-10", "ICD10", NO_CODE_SYSTEM_ANSWERS)).toBe(true)
  })

  it("is not one list because its name contains another word", () => {
    expect(isCodeList("urn:nhis:CL0130", "NHIS_CL013", NO_CODE_SYSTEM_ANSWERS)).toBe(false)
    expect(isCodeList("http://vendor.bg/lists/proc", "KSMP", NO_CODE_SYSTEM_ANSWERS)).toBe(false)
  })
})

describe("an address this hospital answered", () => {
  it("counts for the list it was answered as, whatever its spelling", () => {
    expect(isCodeList(" HTTP://vendor.bg/lists/proc ", "KSMP", vendor)).toBe(true)
    expect(isCodeList("http://vendor.bg/lists/proc", "NHIS_CL013", vendor)).toBe(false)
    expect(codeSystemKey(" HTTP://Vendor.bg/x ")).toBe("http://vendor.bg/x")
  })

  it("turns a vendor's procedure address into a LOSPOR group proposal", () => {
    const resource = {
      resourceType: "ServiceRequest", status: "active",
      code: { text: "Лапароскопска холецистектомия", coding: [{ system: "http://vendor.bg/lists/proc", code: "30445-00" }] },
    }
    expect(mapFhirPlannedProcedures([resource])[0]).toMatchObject({ label: "Лапароскопска холецистектомия" })
    expect(mapFhirPlannedProcedures([resource], vendor)[0]).toMatchObject({
      label: "Cholecystectomy", code: "30445-00", system: "http://vendor.bg/lists/proc",
    })
  })

  it("turns a vendor's route address into a LOSPOR route", () => {
    const resource = {
      resourceType: "MedicationStatement", status: "active",
      medicationCodeableConcept: { text: "Midazolam" },
      dosage: [{ text: "5 mg", route: { coding: [{ system: "http://vendor.bg/lists/route", code: "2", display: "букално" }] } }],
    }
    expect(mapFhirMedications([resource])[0].route).toBe("букално")
    expect(mapFhirMedications([resource], [], vendor)[0].route).toBe("BUCCAL")
  })

  it("resolves a vendor's diagnosis address against LOSPOR's ICD-10", () => {
    const tag = { label: "Холелитиаза", code: "K80.2", system: "http://vendor.bg/lists/dx" }
    expect(resolveImportedDiagnoses([tag], "bg")[0]).toEqual(tag)
    expect(resolveImportedDiagnoses([tag], "bg", vendor)[0]).toMatchObject({ code: "K80.2", system: "ICD-10" })
  })

  it("adds a CL024 copy of a lab coding after the original, which the site map keeps winning", () => {
    const codings = [{ system: "http://vendor.bg/lists/lab", code: "01-000-02", display: "Хемоглобин" }]
    expect(withAnsweredLabCodings(codings, vendor)).toEqual([
      codings[0],
      { system: "NHIS_CL024", code: "01-000-02", display: "Хемоглобин" },
    ])
    expect(withAnsweredLabCodings(codings, NO_CODE_SYSTEM_ANSWERS)).toEqual(codings)
  })
})

describe("addresses asked about in Status", () => {
  const seen = fhirCodeSystemsSeen([
    { resourceType: "ServiceRequest", code: { coding: [{ system: "http://vendor.bg/p", code: "30445-00", display: "Холецистектомия" }] } },
    { resourceType: "ServiceRequest", code: { coding: [{ system: "http://snomed.info/sct", code: "38102005" }] } },
    { resourceType: "MedicationRequest", dosageInstruction: [{ route: { coding: [{ system: "urn:nhis:CL046", code: "PO" }] } }] },
    { resourceType: "MedicationRequest", dosageInstruction: [{ route: { coding: [{ system: "http://vendor.bg/r", code: "2" }] } }] },
  ])

  it("are only the ones nothing recognises, once per address and field", () => {
    const asked = unrecognisedCodeSystems([...seen, ...seen], new Set())
    expect(asked).toEqual([
      { system: "http://vendor.bg/p", field: "procedures", code: "30445-00", label: "Холецистектомия" },
      { system: "http://vendor.bg/r", field: "routes", code: "2", label: undefined },
    ])
  })

  it("stop once answered, including as something else", () => {
    expect(unrecognisedCodeSystems(seen, new Set(["http://vendor.bg/p", "http://vendor.bg/r"]))).toEqual([])
  })
})
