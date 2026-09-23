import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  medicationCodeKey,
  medicationLabelKey,
  medicationVocabulary,
  selectUniqueMedicationCandidate,
} from "./ehr-medication-code-map"
import { mapFhirMedications } from "./ehr-fhir-clinical"

describe("built-in medication vocabulary matching", () => {
  it("recognises ATC, RxNorm, and NHIS product addresses", () => {
    expect(medicationVocabulary("http://www.whocc.no/atc")).toBe("ATC")
    expect(medicationVocabulary("http://www.nlm.nih.gov/research/umls/rxnorm")).toBe("RXNORM")
    expect(medicationVocabulary("https://his.bg/nomenclatures/CL009")).toBe("NHIS_PRODUCT")
    expect(medicationCodeKey("http://www.whocc.no/atc", " C09AA05 ")).toBe("http://www.whocc.no/atc|C09AA05")
  })

  it("does not choose an arbitrary product for an ingredient-level match", () => {
    const candidates = [
      { id: "ampril", name: "Ampril", inn: "Ramipril", atcCode: "C09AA05" },
      { id: "cardifriend", name: "Cardifriend", inn: "Ramipril", atcCode: "C09AA05" },
    ]
    expect(selectUniqueMedicationCandidate(candidates, "Ramipril")).toBeUndefined()
    expect(selectUniqueMedicationCandidate(candidates, "Cardifriend, Tablet, 5 mg")).toMatchObject({ id: "cardifriend" })
    expect(medicationLabelKey("Cardifriend, Tablet, 5 mg")).toBe("cardifriend tablet 5 mg")
  })
})

describe("FHIR medication coding selection", () => {
  it("prefers a recognised ATC coding when a resource carries a local coding too", () => {
    const [tag] = mapFhirMedications([{
      resourceType: "MedicationStatement",
      status: "active",
      medicationCodeableConcept: {
        text: "Cardifriend",
        coding: [
          { system: "urn:bg:his:products", code: "994", display: "Cardifriend" },
          { system: "http://www.whocc.no/atc", code: "C09AA05", display: "Ramipril" },
        ],
      },
    }], [], undefined, {
      "http://www.whocc.no/atc|C09AA05": {
        drugId: "cardifriend",
        name: "Cardifriend",
        inn: "Ramipril",
        atcCode: "C09AA05",
      },
    })
    expect(tag).toMatchObject({
      label: "Cardifriend",
      code: "C09AA05",
      system: "http://www.whocc.no/atc",
      sourceCode: "C09AA05",
      drugId: "cardifriend",
    })
  })
})
