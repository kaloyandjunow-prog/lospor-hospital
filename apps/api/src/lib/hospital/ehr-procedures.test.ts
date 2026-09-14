import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { NO_CODE_SYSTEM_ANSWERS, type CodeSystemAnswers } from "./ehr-code-systems"
import { mapFhirPlannedProcedures } from "./ehr-fhir-clinical"
import { procedureFromCodings, resolveImportedProcedures } from "./ehr-procedures"

const request = (text: string, coding: { system: string; code: string }[]) =>
  ({ resourceType: "ServiceRequest", status: "active", code: { text, coding } })

describe("a КСМП-coded procedure", () => {
  it("is its crosswalked group, filed as КСМП, with the operations the crosswalk reached", () => {
    const [tag] = mapFhirPlannedProcedures([request("Лапароскопска холецистектомия", [{ system: "urn:bg:ksmp", code: "30445-00" }])])
    expect(tag).toEqual({
      label: "Cholecystectomy", group: "Cholecystectomy", code: "30445-00", system: "urn:bg:ksmp",
      sourceVocabulary: "KSMP", sourceLabel: "Лапароскопска холецистектомия",
      suggestedCodes: ["0FB44ZZ", "0FT44ZZ"], source: "import",
    })
  })
})

describe("a КСМП code whose crosswalk reached one operation", () => {
  it("is proposed as that operation, keeping the КСМП code and wording", () => {
    const [tag] = mapFhirPlannedProcedures([request("Тонография за глаукома", [{ system: "urn:bg:ksmp", code: "11203-00" }])])
    expect(tag).toMatchObject({
      code: "4A07XBZ", system: "ICD-10-PCS",
      imported: { code: "11203-00", system: "urn:bg:ksmp", sourceVocabulary: "KSMP", sourceLabel: "Тонография за глаукома" },
      source: "import",
    })
    expect(tag).not.toHaveProperty("suggestedCodes")
  })
})

describe("an ICD-10-PCS-coded procedure", () => {
  it("is the exact operation, keeping the hospital's address and wording", () => {
    const [tag] = mapFhirPlannedProcedures([request("Лапароскопска холецистектомия", [
      { system: "http://www.cms.gov/Medicare/Coding/ICD10", code: "0FT44ZZ" },
    ])])
    expect(tag).toEqual({
      label: "Cholecystectomy", group: "Cholecystectomy", domain: "Hepatobiliary and Pancreas Procedures",
      code: "0FT44ZZ", system: "ICD-10-PCS",
      description: "Resection of Gallbladder, Percutaneous Endoscopic Approach",
      sub: "0FT44ZZ · Resection of Gallbladder, Percutaneous Endoscopic Approach",
      imported: { code: "0FT44ZZ", system: "http://www.cms.gov/Medicare/Coding/ICD10", sourceLabel: "Лапароскопска холецистектомия" },
      source: "import",
    })
  })

  it("wins over a КСМП coding of the same procedure, whatever the order", () => {
    const proposal = procedureFromCodings([
      { system: "urn:bg:ksmp", code: "30445-00" },
      { system: "urn:oid:2.16.840.1.113883.6.4", code: "0FT44ZZ" },
    ], "Холецистектомия", NO_CODE_SYSTEM_ANSWERS)
    expect(proposal).toMatchObject({ code: "0FT44ZZ", system: "ICD-10-PCS" })
  })

  it("is recognised under an address the hospital answered in Status", () => {
    const answers: CodeSystemAnswers = new Map([["http://vendor.bg/ops", "ICD10PCS"]])
    expect(procedureFromCodings([{ system: "http://vendor.bg/ops", code: "0FT44ZZ" }], undefined, NO_CODE_SYSTEM_ANSWERS)).toBeUndefined()
    expect(procedureFromCodings([{ system: "http://vendor.bg/ops", code: "0FT44ZZ" }], undefined, answers)).toMatchObject({ system: "ICD-10-PCS" })
  })

  it("is left as the hospital labelled it when the code is not a real operation", () => {
    const [tag] = mapFhirPlannedProcedures([request("Operation", [{ system: "http://www.cms.gov/Medicare/Coding/ICD10", code: "0ZZZZZZ" }])])
    expect(tag).toEqual({ label: "Operation", code: "0ZZZZZZ", system: "http://www.cms.gov/Medicare/Coding/ICD10", source: "import" })
  })
})

describe("procedures in a dropped file", () => {
  it("are read the same way as a FHIR coding, keeping their provenance", () => {
    const [ksmp, pcs, free] = resolveImportedProcedures([
      { label: "Лапароскопска холецистектомия", code: "30445-00", system: "КСМП", source: "import" },
      { label: "Холецистектомия", code: "0FT44ZZ", system: "ICD-10-PCS", source: "import" },
      { label: "Free text operation" },
    ], NO_CODE_SYSTEM_ANSWERS)
    expect(ksmp).toMatchObject({ label: "Cholecystectomy", sourceVocabulary: "KSMP", code: "30445-00", source: "import" })
    expect(pcs).toMatchObject({ system: "ICD-10-PCS", code: "0FT44ZZ", imported: { code: "0FT44ZZ", system: "ICD-10-PCS", sourceLabel: "Холецистектомия" } })
    expect(free).toEqual({ label: "Free text operation" })
  })
})
