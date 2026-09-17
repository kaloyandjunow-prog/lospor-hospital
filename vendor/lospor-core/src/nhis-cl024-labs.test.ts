import { describe, expect, it } from "vitest"

import { resolveLabTest } from "./ehr-lab-codes"
import { LAB_LIBRARY } from "./labs"
import {
  isNhisCl024System,
  NHIS_CL024_LAB_BY_CODE,
  NHIS_CL024_LAB_MAPPINGS,
  NHIS_CL024_VOCABULARY,
} from "./nhis-cl024-labs"

describe("reviewed NHIS CL024 laboratory mappings", () => {
  it("contains exactly the 50 approved keys, with four intentionally source-only", () => {
    expect(NHIS_CL024_LAB_MAPPINGS).toHaveLength(50)
    expect(NHIS_CL024_LAB_MAPPINGS.filter(mapping => mapping.relationship === "source-only"))
      .toHaveLength(4)
  })

  it("has unique keys, bilingual labels, and only names tests in the library", () => {
    const known = new Set(LAB_LIBRARY.map(test => test.name))
    expect(new Set(NHIS_CL024_LAB_MAPPINGS.map(mapping => mapping.code)).size).toBe(50)
    expect(NHIS_CL024_LAB_MAPPINGS.every(mapping => mapping.labelBg && mapping.labelEn)).toBe(true)
    expect(NHIS_CL024_LAB_MAPPINGS.filter(mapping => !known.has(mapping.test))).toEqual([])
  })

  it("keeps a reviewed crosswalk's NHIS key and standard LOINC", () => {
    const result = resolveLabTest([
      { system: NHIS_CL024_VOCABULARY, code: "03-019-00", display: "Натрий" },
    ])

    expect(result).toMatchObject({
      test: "Sodium (Na⁺)",
      via: "nhis",
      unmapped: false,
      sourceCoding: { vocabulary: NHIS_CL024_VOCABULARY, code: "03-019-00", display: "Натрий" },
      loincCode: "2951-2",
      nhisRelationship: "reviewed-crosswalk",
    })
  })

  it("keeps method-distinct LOINC instead of replacing it with the LOSPOR canonical", () => {
    const result = resolveLabTest([
      { system: "https://his.bg/fhir/CodeSystem/CL024", code: "01-003-00" },
    ])

    expect(result).toMatchObject({ test: "ESR", loincCode: "30341-2", nhisRelationship: "accepted-alternative" })
    expect(result.loincCode).not.toBe("4537-7")
  })

  it("marks under-specified assays source-only rather than inheriting a canonical LOINC", () => {
    for (const code of ["00-00E-00", "00-00C-00", "00-02D-00", "00-00B-00"]) {
      const result = resolveLabTest([{ system: NHIS_CL024_VOCABULARY, code }])
      expect(result.loincCode, code).toBeNull()
      expect(result.nhisRelationship, code).toBe("source-only")
    }
  })

  it("does not admit specifically excluded candidates", () => {
    for (const code of ["02-016-00", "02-015-00", "03-025-00", "04-010-00", "6B-022-00"]) {
      expect(NHIS_CL024_LAB_BY_CODE.has(code), code).toBe(false)
    }
  })

  it("accepts NHIS alternative LOINCs directly while preserving the actual code", () => {
    expect(resolveLabTest([{ system: "http://loinc.org", code: "98979-8" }]))
      .toMatchObject({ test: "eGFR", via: "loinc", loincCode: "98979-8" })
    expect(resolveLabTest([{ system: "http://loinc.org", code: "33959-8" }]))
      .toMatchObject({ test: "Procalcitonin (PCT)", via: "loinc", loincCode: "33959-8" })
  })

  it("requires a CL024 namespace and never trusts the key shape alone", () => {
    expect(isNhisCl024System("urn:nhis:bg:CL024")).toBe(true)
    expect(isNhisCl024System("http://hospital.example/labs")).toBe(false)
    expect(resolveLabTest([{ system: "http://hospital.example/labs", code: "03-019-00" }]).unmapped)
      .toBe(true)
  })
})

