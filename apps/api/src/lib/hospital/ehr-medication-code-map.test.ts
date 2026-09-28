import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const { omopConcepts } = vi.hoisted(() => ({ omopConcepts: vi.fn(async () => [] as { conceptName: string }[]) }))
vi.mock("@/lib/prisma", () => ({ prisma: { omopConcept: { findMany: omopConcepts } } }))

import {
  automaticMedicationCodeMap,
  ensureCatalogDrug,
  medicationCodeCandidates,
  medicationCodeKey,
  searchMedicationCatalog,
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

  it("tells one product's strengths apart by the label, and never reads 5 mg out of 2,5 mg", () => {
    const candidates = [
      { id: "a25", name: "Ampril", inn: "Ramipril", atcCode: "C09AA05", strength: "2,5 mg" },
      { id: "a5", name: "Ampril", inn: "Ramipril", atcCode: "C09AA05", strength: "5 mg" },
      { id: "a10", name: "Ampril", inn: "Ramipril", atcCode: "C09AA05", strength: "10 mg" },
    ]
    expect(selectUniqueMedicationCandidate(candidates, "Ampril 5 mg tablets")).toMatchObject({ id: "a5" })
    expect(selectUniqueMedicationCandidate(candidates, "Ampril 2.5 mg")).toMatchObject({ id: "a25" })
    expect(selectUniqueMedicationCandidate(candidates.slice(1), "Ampril 2,5 mg")).toBeUndefined()
    expect(selectUniqueMedicationCandidate(candidates.slice(1), "Ampril 25 mg")).toBeUndefined()
    expect(selectUniqueMedicationCandidate(candidates, "Ampril")).toBeUndefined()
  })
})

// From 1.4.16 codes resolve against Core's medication list (NHIS CL009 plus the
// BDA products it lacks), not the Drug table, which a site fills only if it runs
// the terminology import.
describe("resolving codes against the medication list", () => {
  const NHIS = "https://his.bg/nomenclatures/CL009"
  const ATC = "http://www.whocc.no/atc"

  it("maps a national product code straight to its product", async () => {
    const map = await automaticMedicationCodeMap([{ system: NHIS, code: "994" }])
    expect(map[medicationCodeKey(NHIS, "994")]).toEqual({
      drugId: "drug-cl009:994", name: "Cardifriend", inn: "Ramipril", atcCode: "C09AA05",
    })
    expect(await automaticMedicationCodeMap([{ system: NHIS, code: "no-such-code" }])).toEqual({})
  })

  it("maps an ATC code only when the label names one product", async () => {
    expect(await automaticMedicationCodeMap([{ system: ATC, code: "C09AA05", display: "Ramipril" }])).toEqual({})
    const map = await automaticMedicationCodeMap([{ system: ATC, code: "c09aa05 ", display: "Cardifriend 5 mg" }])
    expect(map[medicationCodeKey(ATC, "c09aa05 ")]).toMatchObject({ drugId: "drug-cl009:994", atcCode: "C09AA05" })
    // One product carries the code, so no label is needed at all.
    const only = await automaticMedicationCodeMap([{ system: ATC, code: "N02CD01", display: "Migraine pen 70" }])
    expect(only[medicationCodeKey(ATC, "N02CD01")]).toMatchObject({ name: "Aimovig", atcCode: "N02CD01" })
  })

  it("maps a local code by its label when the label names one product", async () => {
    const map = await automaticMedicationCodeMap([{ system: "urn:site:drugs", code: "77", display: "Amlocor 10 mg" }])
    expect(map[medicationCodeKey("urn:site:drugs", "77")]).toMatchObject({ drugId: "drug-cl009:85", name: "Amlocor" })
  })

  it("reads an RxNorm code through its concept name", async () => {
    omopConcepts.mockResolvedValueOnce([{ conceptName: "Cardifriend 5 mg" }])
    const map = await automaticMedicationCodeMap([{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "123" }])
    expect(omopConcepts).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ conceptCode: "123" }) }))
    expect(map[medicationCodeKey("http://www.nlm.nih.gov/research/umls/rxnorm", "123")]).toMatchObject({ drugId: "drug-cl009:994" })
  })

  it("offers the national product, then an ATC code's products, then the label's matches", () => {
    expect(medicationCodeCandidates(NHIS, "85", null)).toEqual([expect.objectContaining({ catalogId: "cl009:85", id: "drug-cl009:85", nhisCode: "85" })])
    const atc = medicationCodeCandidates(ATC, "C08CA01", null)
    expect(atc.length).toBeGreaterThan(5)
    expect(atc.every(candidate => candidate.atcCode === "C08CA01")).toBe(true)
    expect(medicationCodeCandidates("urn:site:drugs", "1", "Amlocor").map(c => c.name)).toContain("Amlocor")
    expect(medicationCodeCandidates("urn:site:drugs", "1", null)).toEqual([])
  })

  it("searches the whole list by name, INN or ATC code", () => {
    expect(searchMedicationCatalog("amlocor").map(c => c.catalogId)).toEqual(expect.arrayContaining(["cl009:84", "cl009:85"]))
    expect(searchMedicationCatalog("C09AA05").every(c => c.atcCode === "C09AA05")).toBe(true)
    expect(searchMedicationCatalog("C09AA05").length).toBeGreaterThan(5)
  })

  it("makes the Drug row a mapping points at, from the list", async () => {
    const upsert = vi.fn(async (args: { where: { id: string } }) => ({ id: args.where.id }))
    const db = { drug: { upsert } } as never
    expect(await ensureCatalogDrug(db, "cl009:994")).toBe("drug-cl009:994")
    const fields = { name: "Cardifriend", inn: "Ramipril", atcCode: "C09AA05", form: "Tablet", strength: "5 mg" }
    expect(upsert).toHaveBeenCalledWith({
      where: { id: "drug-cl009:994" },
      create: { id: "drug-cl009:994", ...fields },
      update: fields,
      select: { id: true },
    })
    expect(await ensureCatalogDrug(db, "cl009:no-such")).toBeNull()
    expect(upsert).toHaveBeenCalledTimes(1)
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
