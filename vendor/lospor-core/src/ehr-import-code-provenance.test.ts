import { describe, expect, it } from "vitest"

import { normalizeEhrImport, type EhrLabValue } from "./ehr-import"

function normalizedLab(raw: Record<string, unknown>): EhrLabValue {
  const result = normalizeEhrImport({
    identifierType: "IZ",
    identifier: "42",
    fields: { labResults: [raw] },
  })
  const field = result.canonical.fields.find(candidate => candidate.field === "labResults")
  return (field?.value as EhrLabValue[])[0]
}

describe("imported laboratory code provenance", () => {
  it("keeps both an NHIS key and its reviewed standard LOINC", () => {
    expect(normalizedLab({
      test: "Sodium (Na⁺)",
      value: "140",
      unit: "mmol/L",
      takenAt: "2026-09-13T08:00:00Z",
      sourceVocabulary: "NHIS_CL024",
      sourceCode: "03-019-00",
      loincCode: "2951-2",
    })).toMatchObject({
      sourceVocabulary: "NHIS_CL024",
      sourceCode: "03-019-00",
      loincCode: "2951-2",
    })
  })

  it("preserves explicit null so a source-only assay cannot inherit LOINC", () => {
    const lab = normalizedLab({
      test: "Troponin I (hs-cTnI)",
      value: "7",
      unit: "ng/L",
      sourceVocabulary: "NHIS_CL024",
      sourceCode: "00-00C-00",
      loincCode: null,
    })

    expect(lab).toHaveProperty("loincCode", null)
  })

  it("does not keep half of a source identifier", () => {
    expect(normalizedLab({
      test: "Sodium (Na⁺)",
      value: "140",
      unit: "mmol/L",
      sourceVocabulary: "NHIS_CL024",
    })).not.toHaveProperty("sourceVocabulary")
  })
})

