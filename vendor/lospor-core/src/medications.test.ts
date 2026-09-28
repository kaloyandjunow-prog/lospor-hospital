import { describe, expect, it } from "vitest"

import { medicationById, medicationByNhisCode, medicationsWithAtc, searchMedications, type MedicationRow } from "./medications"
import { MEDICATION_ROW_COUNT, medicationRows } from "./vocabulary/medications"

const row = (id: string, name: string, inn: string, atc: string, extra: Partial<MedicationRow> = {}): MedicationRow =>
  ({ id, name, inn, atc, form: "Tablet", strength: "10 mg", nhisCode: null, ...extra })

const rows = [
  row("cl009:1", "Amlessa", "Perindopril, amlodipine", "C09BB04", { nhisCode: "1" }),
  row("cl009:2", "Ampril", "Ramipril", "C09AA05", { nhisCode: "2" }),
  // The same product in another pack: one entry when searched.
  row("cl009:3", "Ampril", "Ramipril", "C09AA05", { nhisCode: "3" }),
  row("cl009:4", "Tritace", "Ramipril", "C09AA05", { strength: "5 mg", nhisCode: "4" }),
  row("bda:ab", "Hartil", "Ramipril", "C09AA05"),
  row("cl009:5", "Rampiril-X", "Something else", "N02BE01", { nhisCode: "5" }),
]

describe("one search over the medication list", () => {
  it("ranks a name or INN starting with the query first, and lists each product once", () => {
    const found = searchMedications(rows, "ramipril")
    expect(found.map(r => r.name)).toEqual(["Ampril", "Tritace", "Hartil"])
    // A name that only contains the query comes after one that starts with it.
    expect(searchMedications(rows, "amp").map(r => r.name)).toEqual(["Ampril", "Rampiril-X"])
    // By rank, not by where the list happens to put them.
    expect(searchMedications([...rows].reverse(), "amp").map(r => r.name)).toEqual(["Ampril", "Rampiril-X"])
  })

  it("finds by ATC code, whole or by prefix", () => {
    expect(searchMedications(rows, "C09AA05").map(r => r.name)).toEqual(["Ampril", "Tritace", "Hartil"])
    expect(searchMedications(rows, "c09").map(r => r.id)).toEqual(["cl009:1", "cl009:2", "cl009:4", "bda:ab"])
  })

  it("ignores accents and case, and answers nothing to nothing", () => {
    expect(searchMedications([row("x", "Paracétamol", "Paracétamol", "N02BE01")], "PARACETAMOL")).toHaveLength(1)
    expect(searchMedications([row("x", "Paracetamol", "Paracetamol", "N02BE01")], "parácetamol")).toHaveLength(1)
    expect(searchMedications(rows, "  ")).toEqual([])
  })

  it("stops at the limit", () => {
    expect(searchMedications(rows, "ramipril", 2)).toHaveLength(2)
  })

  it("resolves a national product code, an ATC code and an id", () => {
    expect(medicationByNhisCode(rows, " 3 ")?.id).toBe("cl009:3")
    expect(medicationByNhisCode(rows, "99")).toBeUndefined()
    expect(medicationsWithAtc(rows, "c09aa05").map(r => r.id)).toEqual(["cl009:2", "cl009:4", "bda:ab"])
    expect(medicationById(rows, "bda:ab")?.name).toBe("Hartil")
  })
})

describe("the generated list", () => {
  const all = medicationRows()

  it("has every row it says it has, with unique ids", () => {
    expect(all).toHaveLength(MEDICATION_ROW_COUNT)
    expect(new Set(all.map(r => r.id)).size).toBe(all.length)
  })

  it("carries only well-formed WHO ATC codes, and national codes on national rows", () => {
    for (const r of all) {
      if (r.atc) expect(r.atc, r.id).toMatch(/^[A-Z](\d{2}([A-Z]([A-Z](\d{2})?)?)?)?$/)
      expect(r.id.startsWith("cl009:") ? r.nhisCode : null, r.id).toBe(r.id.startsWith("cl009:") ? r.id.slice(6) : null)
    }
  })

  it("finds everyday drugs by name and by ATC", () => {
    expect(searchMedications(all, "ramipril").length).toBeGreaterThan(3)
    expect(searchMedications(all, "C09AA05").every(r => r.atc === "C09AA05")).toBe(true)
    expect(searchMedications(all, "metformin")[0].atc).toBe("A10BA02")
  })
})
