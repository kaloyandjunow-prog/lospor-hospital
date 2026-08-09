import { describe, expect, it } from "vitest"
import { PREMED_CATS, PREMED_DOSES } from "./catalog/premed-drugs"
import type { PremedicationCategory } from "./option-library"
import {
  buildPediatricPremedLibrary,
  pediatricPremedDoseForRoute,
  type PediatricPremedPatient,
} from "./pediatric-premedication-library"

/** The adult library, in the shape both pickers consume it. */
const LIBRARY: PremedicationCategory[] = PREMED_CATS.map(category => ({
  category: category.cat,
  drugs: category.drugs
    .filter(name => PREMED_DOSES[name])
    .map(name => ({ name, ...PREMED_DOSES[name] })),
}))

const CHILD: PediatricPremedPatient = {
  weightKg: 14,
  heightCm: 96,
  sex: "MALE",
  age: { value: 3, unit: "YEARS" },
}

function find(categories: ReturnType<typeof buildPediatricPremedLibrary>, name: string) {
  return categories.flatMap(category => category.drugs).find(drug => drug.name === name)
}

describe("the paediatric premedication library", () => {
  const built = buildPediatricPremedLibrary(LIBRARY, CHILD)

  it("is not empty, which is what paediatric mode used to get on mobile", () => {
    expect(built.length).toBeGreaterThan(0)
    expect(built.flatMap(category => category.drugs).length).toBeGreaterThan(5)
  })

  it("doses paracetamol for the child, not the adult", () => {
    expect(find(built, "Paracetamol")?.dose).toBe(210)   // 15 mg/kg x 14 kg
    expect(PREMED_DOSES.Paracetamol.dose).toBe(1000)     // what web still shows today
  })

  it("carries the arithmetic with the dose", () => {
    const drug = find(built, "Midazolam")
    expect(drug?.dose).toBe(7)
    expect(drug?.pediatric).toMatchObject({
      kind: "calculated", perKg: 0.5, weightUsedKg: 14, basis: "TBW",
    })
  })

  it("drops a drug with no paediatric rule instead of showing the adult dose", () => {
    expect(find(built, "Esomeprazole")).toBeUndefined()
    expect(find(built, "Pantoprazole")).toBeUndefined()
  })

  it("keeps a withheld drug visible with its reason", () => {
    const codeine = find(built, "Codeine")
    expect(codeine?.pediatric).toMatchObject({ kind: "withheld" })
    expect(codeine?.pediatric?.kind === "withheld" && codeine.pediatric.reason)
      .toMatch(/[Cc]ontraindicated/)
  })

  it("offers only the routes with a paediatric rule", () => {
    expect(find(built, "Ondansetron")?.routes).toEqual(["PO", "IV"])
    expect(PREMED_DOSES.Ondansetron.routes).toContain("IM")   // adult has IM, we do not
  })

  it("offers dexmedetomidine intranasally at 4 mcg/kg", () => {
    const drug = find(built, "Dexmedetomidine")
    expect(drug?.routes).toEqual(["Intranasal"])
    expect(drug?.dose).toBe(55)          // 4 x 14 = 56, rounded to the 5 mcg step
    expect(drug?.unit).toBe("mcg")
  })

  it("never exceeds the adult dose for any drug it offers", () => {
    const teenager = buildPediatricPremedLibrary(LIBRARY, {
      weightKg: 95, heightCm: 182, sex: "MALE", age: { value: 17, unit: "YEARS" },
    })
    for (const category of teenager) {
      for (const drug of category.drugs) {
        if (drug.pediatric?.kind !== "calculated") continue
        const adult = PREMED_DOSES[drug.name]
        if (!adult || adult.unit !== drug.unit) continue
        expect(drug.dose, `${drug.name} exceeds the adult maximum`)
          .toBeLessThanOrEqual(adult.max)
      }
    }
  })
})

describe("the recorded weight drives the dose", () => {
  it("moves the dose when the weight changes", () => {
    const lighter = buildPediatricPremedLibrary(LIBRARY, { weightKg: 10, age: { value: 2, unit: "YEARS" } })
    const heavier = buildPediatricPremedLibrary(LIBRARY, { weightKg: 30, age: { value: 9, unit: "YEARS" } })
    expect(find(lighter, "Paracetamol")?.dose).toBe(150)
    expect(find(heavier, "Paracetamol")?.dose).toBe(450)
  })

  it("asks for a weight instead of dosing on a guess", () => {
    const built = buildPediatricPremedLibrary(LIBRARY, { age: { value: 3, unit: "YEARS" } })
    const drug = find(built, "Paracetamol")
    expect(drug?.pediatric).toMatchObject({ kind: "needs-weight" })
    expect(drug?.dose).toBe(0)
  })
})

describe("changing route changes the dose", () => {
  const midazolam = { name: "Midazolam", ...PREMED_DOSES.Midazolam }

  it("drops tenfold from oral to intravenous", () => {
    const oral = pediatricPremedDoseForRoute(midazolam, "PO", CHILD)
    const iv = pediatricPremedDoseForRoute(midazolam, "IV", CHILD)
    expect(oral.status === "calculated" && oral.dose).toBe(7)
    expect(iv.status === "calculated" && iv.dose).toBe(0.7)
  })

  it("reports no suggestion for a route without a paediatric rule", () => {
    expect(pediatricPremedDoseForRoute(
      { name: "Ibuprofen", ...PREMED_DOSES.Ibuprofen }, "IV", CHILD,
    ).status).toBe("manual")
  })
})
