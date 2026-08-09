import { describe, expect, it } from "vitest"
import { PREMED_DOSES } from "./catalog/premed-drugs"
import {
  PEDIATRIC_PREMEDICATION,
  hasPediatricPremedication,
  pediatricPremedicationRoutes,
  resolvePediatricPremedication,
} from "./pediatric-premedication"

const YEARS = (value: number) => ({ value, unit: "YEARS" as const })
const MONTHS = (value: number) => ({ value, unit: "MONTHS" as const })

describe("weight-based premedication", () => {
  it("scales paracetamol to the child rather than handing over the adult gram", () => {
    const result = resolvePediatricPremedication({
      drug: "Paracetamol", route: "PO", weightKg: 12, age: YEARS(2),
    })
    expect(result.status).toBe("calculated")
    if (result.status !== "calculated") return
    expect(result.dose).toBe(180)          // 15 mg/kg x 12 kg
    expect(result.capped).toBe(false)
    expect(PREMED_DOSES.Paracetamol.dose).toBe(1000)  // what it used to offer
  })

  it("caps at the adult dose once the child is big enough to exceed it", () => {
    const result = resolvePediatricPremedication({
      drug: "Paracetamol", route: "PO", weightKg: 80, age: YEARS(16),
    })
    expect(result.status).toBe("calculated")
    if (result.status !== "calculated") return
    expect(result.dose).toBe(1000)         // 15 x 80 = 1200, capped
    expect(result.capped).toBe(true)
  })

  it("gives oral midazolam at 0.5 mg/kg", () => {
    const result = resolvePediatricPremedication({
      drug: "Midazolam", route: "PO", weightKg: 14, age: YEARS(3),
    })
    expect(result.status).toBe("calculated")
    if (result.status !== "calculated") return
    expect(result.dose).toBe(7)
    expect(result.perKg).toBe(0.5)
    expect(result.weightUsedKg).toBe(14)
  })

  it("reports the arithmetic so the number can be checked", () => {
    const result = resolvePediatricPremedication({
      drug: "Ondansetron", route: "IV", weightKg: 18, age: YEARS(5),
    })
    expect(result.status).toBe("calculated")
    if (result.status !== "calculated") return
    expect(result).toMatchObject({ perKg: 0.1, weightUsedKg: 18, cap: 4, dose: 2 })
  })
})

describe("intranasal dexmedetomidine", () => {
  it("gives 4 mcg/kg", () => {
    const result = resolvePediatricPremedication({
      drug: "Dexmedetomidine", route: "Intranasal", weightKg: 14, age: YEARS(3),
    })
    expect(result.status).toBe("calculated")
    if (result.status !== "calculated") return
    expect(result.dose).toBe(55)          // 4 x 14 = 56, rounded to the 5 mcg step
    expect(result.unit).toBe("mcg")
    expect(result.perKg).toBe(4)
  })

  it("caps at 200 mcg for a larger child", () => {
    const result = resolvePediatricPremedication({
      drug: "Dexmedetomidine", route: "Intranasal", weightKg: 60, age: YEARS(15),
    })
    expect(result.status).toBe("calculated")
    if (result.status !== "calculated") return
    expect(result.dose).toBe(200)         // 4 x 60 = 240, capped
    expect(result.capped).toBe(true)
  })

  it("is the only premedication route offered for it", () => {
    expect(pediatricPremedicationRoutes("Dexmedetomidine")).toEqual(["Intranasal"])
  })
})

describe("refusing to suggest", () => {
  it("never falls back to the adult dose for an uncovered drug", () => {
    const result = resolvePediatricPremedication({
      drug: "Esomeprazole", route: "PO", weightKg: 20, age: YEARS(6),
    })
    expect(result.status).toBe("manual")
  })

  it("asks for a weight rather than guessing one", () => {
    const result = resolvePediatricPremedication({
      drug: "Paracetamol", route: "PO", weightKg: null, age: YEARS(4),
    })
    expect(result.status).toBe("needs-weight")
  })

  it("withholds codeine from children entirely", () => {
    const result = resolvePediatricPremedication({
      drug: "Codeine", route: "PO", weightKg: 30, age: YEARS(10),
    })
    expect(result.status).toBe("withheld")
    expect(result.status === "withheld" && result.reason).toMatch(/[Cc]ontraindicated/)
  })

  it("withholds aspirin below sixteen", () => {
    const result = resolvePediatricPremedication({
      drug: "Aspirin", route: "PO", weightKg: 45, age: YEARS(12),
    })
    expect(result.status).toBe("withheld")
    expect(result.status === "withheld" && result.reason).toMatch(/Reye/)
  })

  it("withholds tramadol under twelve but allows it after", () => {
    expect(resolvePediatricPremedication({
      drug: "Tramadol", route: "PO", weightKg: 30, age: YEARS(9),
    }).status).toBe("withheld")

    const teenager = resolvePediatricPremedication({
      drug: "Tramadol", route: "PO", weightKg: 45, age: YEARS(14),
    })
    expect(teenager.status).toBe("calculated")
    if (teenager.status !== "calculated") return
    expect(teenager.dose).toBe(45)
  })

  it("withholds ibuprofen under three months", () => {
    expect(resolvePediatricPremedication({
      drug: "Ibuprofen", route: "PO", weightKg: 4, age: MONTHS(1),
    }).status).toBe("withheld")
    expect(resolvePediatricPremedication({
      drug: "Ibuprofen", route: "PO", weightKg: 8, age: MONTHS(9),
    }).status).toBe("calculated")
  })

  it("has no suggestion for a route the rules do not cover", () => {
    expect(resolvePediatricPremedication({
      drug: "Ibuprofen", route: "IV", weightKg: 20, age: YEARS(6),
    }).status).toBe("manual")
  })
})

describe("practical minimums", () => {
  it("lifts a tiny computed dose to the smallest amount that can be given", () => {
    // 20 mcg/kg on a 3 kg neonate is 60 mcg; atropine is not given below 100.
    const result = resolvePediatricPremedication({
      drug: "Atropine", route: "IV", weightKg: 3, age: MONTHS(1),
    })
    expect(result.status).toBe("calculated")
    if (result.status !== "calculated") return
    expect(result.dose).toBe(0.1)
  })

  it("never lets that minimum push a dose above the cap", () => {
    for (const [drug, entry] of Object.entries(PEDIATRIC_PREMEDICATION)) {
      for (const [route, rule] of Object.entries(entry.routes)) {
        if (rule.floor == null) continue
        expect(rule.floor, `${drug} ${route} floor exceeds its cap`)
          .toBeLessThanOrEqual(rule.cap)
      }
    }
  })
})

describe("invariants across the whole rule set", () => {
  it("caps no higher than the adult dose", () => {
    for (const [drug, entry] of Object.entries(PEDIATRIC_PREMEDICATION)) {
      const adult = PREMED_DOSES[drug]
      if (!adult) continue
      for (const [route, rule] of Object.entries(entry.routes)) {
        if (rule.unit !== adult.unit) continue
        expect(rule.cap, `${drug} ${route} cap exceeds the adult maximum`)
          .toBeLessThanOrEqual(adult.max)
      }
    }
  })

  it("names only drugs that exist in the premedication catalogue", () => {
    for (const drug of Object.keys(PEDIATRIC_PREMEDICATION)) {
      expect(PREMED_DOSES[drug], `${drug} is not a premedication drug`).toBeDefined()
    }
  })

  it("names only routes the drug actually has", () => {
    for (const [drug, entry] of Object.entries(PEDIATRIC_PREMEDICATION)) {
      const adultRoutes = PREMED_DOSES[drug]?.routes ?? []
      for (const route of Object.keys(entry.routes)) {
        expect(adultRoutes, `${drug} has no ${route} route`).toContain(route)
      }
    }
  })

  it("gives every rule a positive per-kilogram amount and a cap", () => {
    for (const [drug, entry] of Object.entries(PEDIATRIC_PREMEDICATION)) {
      for (const [route, rule] of Object.entries(entry.routes)) {
        expect(rule.perKg, `${drug} ${route}`).toBeGreaterThan(0)
        expect(rule.cap, `${drug} ${route}`).toBeGreaterThan(0)
        expect(rule.roundTo, `${drug} ${route}`).toBeGreaterThan(0)
      }
    }
  })

  it("never produces a dose above the cap, at any weight", () => {
    for (const [drug, entry] of Object.entries(PEDIATRIC_PREMEDICATION)) {
      for (const route of Object.keys(entry.routes)) {
        for (const weightKg of [2, 5, 10, 25, 50, 90, 150]) {
          const result = resolvePediatricPremedication({
            drug, route, weightKg, heightCm: 150, sex: "MALE", age: YEARS(17),
          })
          if (result.status !== "calculated") continue
          expect(result.dose, `${drug} ${route} at ${weightKg} kg`)
            .toBeLessThanOrEqual(result.cap)
        }
      }
    }
  })

  it("agrees with the intraop paediatric profile on oral midazolam", () => {
    // Both surfaces dose the same child; disagreeing would be worse than either
    // number being slightly conservative.
    const premed = resolvePediatricPremedication({
      drug: "Midazolam", route: "PO", weightKg: 20, age: YEARS(6),
    })
    expect(premed.status === "calculated" && premed.perKg).toBe(0.5)
  })
})

describe("route listing", () => {
  it("lists paediatric routes in the order the adult catalogue uses", () => {
    expect(pediatricPremedicationRoutes("Midazolam")).toEqual(["PO", "IM", "IV", "Intranasal"])
  })

  it("reports a drug with no paediatric rules", () => {
    expect(hasPediatricPremedication("Codeine")).toBe(false)
    expect(hasPediatricPremedication("Paracetamol")).toBe(true)
    expect(hasPediatricPremedication("Nonexistent")).toBe(false)
  })
})
