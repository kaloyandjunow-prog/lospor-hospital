import { describe, expect, it } from "vitest"
import { PREMED_CATS, PREMED_DOSES } from "@lospor/core/catalog"
import { buildIntraopPreopSummary } from "@/lib/intraop-preop-summary"
import {
  buildPediatricPremedLibrary,
  premedPatientFromPreop,
} from "./pediatric-premedication-library"

/**
 * The library logic itself is tested in core. What is mobile's own is the
 * mapping out of the preop record — so these walk the real seam: the record as
 * it is stored, through the summary the intraop screen builds from it, into the
 * doses. A field rename at either end breaks this rather than silently dosing
 * on no weight at all.
 */
const LIBRARY = PREMED_CATS.map(category => ({
  category: category.cat,
  drugs: category.drugs
    .filter(name => PREMED_DOSES[name])
    .map(name => ({ name, ...PREMED_DOSES[name] })),
}))

function fromPreopRecord(record: Record<string, unknown>) {
  return buildPediatricPremedLibrary(LIBRARY, buildIntraopPreopSummary(record, "PEDIATRIC"))
}

function find(categories: ReturnType<typeof fromPreopRecord>, name: string) {
  return categories.flatMap(category => category.drugs).find(drug => drug.name === name)
}

describe("the weight entered in preop drives the dose", () => {
  it("reads weightKg as the preop form stores it", () => {
    const built = fromPreopRecord({ weightKg: 20, heightCm: 110, sex: "FEMALE", ageValue: 6, ageUnit: "YEARS" })
    expect(find(built, "Paracetamol")?.dose).toBe(300)   // 15 mg/kg x 20 kg
    expect(find(built, "Midazolam")?.dose).toBe(10)      // 0.5 mg/kg x 20 kg
  })

  it("moves the dose when the recorded weight changes", () => {
    expect(find(fromPreopRecord({ weightKg: 10, ageValue: 2, ageUnit: "YEARS" }), "Paracetamol")?.dose).toBe(150)
    expect(find(fromPreopRecord({ weightKg: 30, ageValue: 9, ageUnit: "YEARS" }), "Paracetamol")?.dose).toBe(450)
  })

  it("accepts the legacy weight field too", () => {
    expect(find(fromPreopRecord({ weight: 14, ageValue: 3, ageUnit: "YEARS" }), "Paracetamol")?.dose).toBe(210)
  })

  it("asks for a weight when preop has none, instead of dosing on a guess", () => {
    const built = fromPreopRecord({ ageValue: 3, ageUnit: "YEARS" })
    expect(find(built, "Paracetamol")?.pediatric).toMatchObject({ kind: "needs-weight" })
  })
})

describe("premedPatientFromPreop", () => {
  it("carries weight, height, sex and age across", () => {
    const summary = buildIntraopPreopSummary(
      { weightKg: 18, heightCm: 105, sex: "FEMALE", ageValue: 5, ageUnit: "YEARS" },
      "PEDIATRIC",
    )
    expect(premedPatientFromPreop(summary)).toEqual({
      weightKg: 18,
      heightCm: 105,
      sex: "FEMALE",
      age: { value: 5, unit: "YEARS" },
    })
  })

  it("has no age outside paediatric mode, so nothing is dosed as a child", () => {
    const summary = buildIntraopPreopSummary({ weightKg: 80, ageValue: 40, ageUnit: "YEARS" }, "ADULT")
    expect(premedPatientFromPreop(summary).age).toBeNull()
  })
})
