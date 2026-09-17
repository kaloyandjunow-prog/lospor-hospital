import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { icd10Rows } from "@lospor/core/vocabulary"
import { canonicalIcd10Code, resolveImportedDiagnoses } from "./ehr-icd10"

const row = (code: string) => icd10Rows().find(entry => entry.code === code)!

describe("imported diagnoses resolved against LOSPOR's ICD-10", () => {
  it("becomes the picker's own tag, with the hospital's wording kept beside it", () => {
    const [bg] = resolveImportedDiagnoses([
      { label: "Холелитиаза", code: "k802", system: "http://hl7.org/fhir/sid/icd-10", source: "import" },
    ], "bg")
    expect(bg).toMatchObject({
      label: row("K80.2").labelBg,
      code: "K80.2",
      system: "ICD-10",
      labelEn: row("K80.2").labelEn,
      labelBg: row("K80.2").labelBg,
      sourceLabel: "Холелитиаза",
      source: "import",
    })

    const [en] = resolveImportedDiagnoses([{ label: "Gallstones", code: "K80.2" }], "en")
    expect(en.label).toBe(row("K80.2").labelEn)
  })

  it("does not repeat wording that is already LOSPOR's label", () => {
    const [tag] = resolveImportedDiagnoses([{ label: row("J45.9").labelEn, code: "J45.9", system: "ICD-10" }], "en")
    expect(tag.sourceLabel).toBeUndefined()
  })

  it("recognises a system naming the NHIS ICD-10 list", () => {
    const [tag] = resolveImportedDiagnoses([{ label: "Хипертония", code: "I10", system: "https://his.vendor.bg/nomenclatures/CL011" }], "bg")
    expect(tag).toMatchObject({ code: "I10", system: "ICD-10", label: row("I10").labelBg })
  })

  it("imports exactly as sent what it cannot resolve", () => {
    const sent = [
      // A code LOSPOR does not hold.
      { label: "Something rare", code: "Z99.99", system: "ICD-10" },
      // A code in another vocabulary, even one that looks like ICD-10.
      { label: "Hypertension", code: "I10", system: "http://snomed.info/sct" },
      { label: "Local", code: "I10", system: "http://hospital.example/local-codes" },
      // Free text.
      { label: "Difficult airway in 2019" },
      // A range is not a diagnosis.
      { label: "Intestinal infectious diseases", code: "A00-A09", system: "ICD-10" },
    ]
    expect(resolveImportedDiagnoses(sent, "bg")).toEqual(sent)
  })

  it("reads a code however it was spelt, and nothing that is not a code", () => {
    expect(canonicalIcd10Code(" k80.2 ")).toBe("K80.2")
    expect(canonicalIcd10Code("K802")).toBe("K80.2")
    expect(canonicalIcd10Code("I10")).toBe("I10")
    expect(canonicalIcd10Code("X34.71")).toBe("X34.71")
    expect(canonicalIcd10Code("A00-A09")).toBeNull()
    expect(canonicalIcd10Code("hypertension")).toBeNull()
  })
})
