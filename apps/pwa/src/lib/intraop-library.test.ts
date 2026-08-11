import { describe, expect, it } from "vitest"
import type { LibraryOption } from "@/lib/use-option-library"
import {
  quickNumberMap, quickStringMap, routesMap, concentrationsMap, defaultConcentrationMap,
  suggestedRateMap, strictRangeMap, defaultedRangeMap, routeProfilesMap, baseProfilesMap,
  doseCalcMap, codesMap, groupDrugCategories, groupClinicalEvents, canStartDrugAsInfusion,
  drugBaseProfilesMap, drugRouteProfilesMap,
} from "./intraop-library"

function opt(label: string, metadata: Record<string, unknown>): LibraryOption {
  return { label, metadata } as unknown as LibraryOption
}

const PROPOFOL = opt("Propofol", { quickValues: [2, 4, 6], unit: "mg/kg/hr", min: 0, max: 15, step: 0.1, suggestedRate: 6, routes: ["IV"] })
const LIDOCAINE = opt("Lidocaine", {
  routes: ["IV", "PD"],
  routeModes: {
    IV: { mode: "rate", min: 0, max: 10, step: 0.1, unit: "mg/kg/hr", quickValues: [1, 2], doseCalc: { perKg: 1, roundTo: 10 } },
    PD: { mode: "concentration-rate", min: 0, max: 50, step: 1, unit: "mL/hr", quickValues: [2, 4, 6], concentrationOptions: ["1%", "2%"], suggestedRate: 6, suggestedConcentration: "1%" },
  },
})
const HES = opt("HES", { quickValues: [250, 500], concentrationOptions: ["6%", "10%"], defaultConcentration: "10%" })
const ALL = [PROPOFOL, LIDOCAINE, HES]

describe("intraop-library builders", () => {
  it("quick values (numbers vs strings)", () => {
    expect(quickNumberMap(ALL)).toEqual({ Propofol: [2, 4, 6], HES: [250, 500] })
    expect(quickStringMap([PROPOFOL])).toEqual({ Propofol: ["2", "4", "6"] })
  })

  it("routes default to IV", () => {
    expect(routesMap(ALL)).toEqual({ Propofol: ["IV"], Lidocaine: ["IV", "PD"], HES: ["IV"] })
  })

  it("concentration options + default (top-level only)", () => {
    expect(concentrationsMap(ALL)).toEqual({ HES: ["6%", "10%"] }) // Lidocaine's are per-route
    expect(defaultConcentrationMap(ALL)).toEqual({ HES: "10%" })
  })

  it("suggested rate as string", () => {
    expect(suggestedRateMap(ALL)).toEqual({ Propofol: "6" })
  })

  it("strict range only when fully specified; defaulted range for all", () => {
    expect(strictRangeMap(ALL)).toEqual({ Propofol: { min: 0, max: 15, step: 0.1 } })
    expect(defaultedRangeMap(ALL)).toEqual({
      Propofol: { min: 0, max: 15, step: 0.1 },
      Lidocaine: { min: 0, max: 100, step: 1 },
      HES: { min: 0, max: 100, step: 1 },
    })
  })

  it("route profiles carry per-route unit/concentration/suggested values", () => {
    const rp = routeProfilesMap(ALL)
    expect(Object.keys(rp)).toEqual(["Lidocaine"])
    expect(rp.Lidocaine.IV).toMatchObject({ unit: "mg/kg/hr", min: 0, max: 10, step: 0.1 })
    expect(rp.Lidocaine.PD).toMatchObject({ unit: "mL/hr", concentrationOptions: ["1%", "2%"], suggestedRate: 6, suggestedConcentration: "1%" })
  })

  it("base profiles only for flat-specified entries", () => {
    const bp = baseProfilesMap(ALL)
    expect(Object.keys(bp)).toEqual(["Propofol"])
    expect(bp.Propofol).toMatchObject({ unit: "mg/kg/hr", suggestedRate: 6 })
  })

  it("dose calc merges per-route doseCalc from routeModes", () => {
    const dc = doseCalcMap(ALL)
    expect(Object.keys(dc)).toEqual(["Lidocaine"])
    expect(dc.Lidocaine.byRoute?.IV).toEqual({ perKg: 1, roundTo: 10 })
  })

  it("codes map always present (undefined when absent)", () => {
    expect(codesMap([PROPOFOL])).toEqual({ Propofol: { drugId: undefined, atcCode: undefined, inn: undefined } })
  })

  it("groups drugs by category with a colour resolver", () => {
    const opts = [
      { label: "Propofol", group: "Induction", metadata: { unit: "mg" } },
      { label: "Rocuronium", group: "Relaxants", metadata: { unit: "mg" } },
      { label: "Midazolam", group: "Induction", metadata: {} },
    ] as unknown as Parameters<typeof groupDrugCategories>[0]
    const cats = groupDrugCategories(opts, c => (c === "Induction" ? "#00f" : "#888"))
    expect(cats.map(c => c.cat)).toEqual(["Induction", "Relaxants"])
    expect(cats[0]).toMatchObject({ color: "#00f" })
    expect(cats[0].drugs).toEqual([{ name: "Propofol", unit: "mg" }, { name: "Midazolam", unit: "mg" }]) // unit falls back to mg
  })

  it("groups clinical events with category colour + complication flag", () => {
    const opts = [
      { label: "Hypotension", group: "Cardiovascular", color: "#f00", metadata: { categoryColor: "#900", isComplication: true } },
      { label: "Incision", group: "Surgical", color: "#0f0", metadata: { categoryColor: "#090" } },
    ] as unknown as Parameters<typeof groupClinicalEvents>[0]
    const cats = groupClinicalEvents(opts)
    expect(cats[0]).toMatchObject({ cat: "Cardiovascular", color: "#900", isComplication: true })
    expect(cats[0].events).toEqual([{ label: "Hypotension", color: "#f00" }])
    expect(cats[1].isComplication).toBe(false)
  })

  it("detects when a selected bolus drug can start as an infusion", () => {
    const infusionDrugs = [{ name: "Propofol" }, { name: "Remifentanil" }]
    expect(canStartDrugAsInfusion({ name: "Propofol" }, infusionDrugs)).toBe(true)
    expect(canStartDrugAsInfusion({ name: "Fentanyl" }, infusionDrugs)).toBe(false)
    expect(canStartDrugAsInfusion(null, infusionDrugs)).toBe(false)
  })
})

/**
 * These two wrappers are what the dosing sheets actually read. They sit between
 * the option library and the sheet, so a wrong shape here does not throw — it
 * shows up as a wrong suggested dose, or as a route the clinician cannot find.
 *
 * Baricity is the sharpest case: an epidural entry and the drug's own default
 * can disagree, and picking the wrong one is a clinical error, not a display bug.
 */
const BUPIVACAINE = opt("Bupivacaine", {
  routes: ["IV", "PD"],
  // A drug-level range, which each route may then override.
  unit: "mg", min: 0, max: 150, step: 5, quickValues: [50, 100],
  formulationOptions: ["ISOBARIC", "HYPERBARIC"],
  defaultFormulation: "ISOBARIC",
  routeModes: {
    IV: { mode: "rate", min: 0, max: 10, step: 0.1, unit: "mg/hr", quickValues: [1, 2] },
    PD: {
      mode: "rate", min: 0, max: 20, step: 1, unit: "mL/hr", quickValues: [5],
      defaultFormulation: "HYPERBARIC",
    },
  },
})

const SALINE = opt("Sodium chloride 0.9%", { note: "no dosing surface at all" })

describe("drugBaseProfilesMap", () => {
  it("keys a surface by the option's label and carries the drug's own formulation", () => {
    const map = drugBaseProfilesMap([BUPIVACAINE])
    expect(Object.keys(map)).toEqual(["Bupivacaine"])
    expect(map.Bupivacaine.defaultFormulation).toBe("ISOBARIC")
    expect(map.Bupivacaine.formulationOptions).toEqual(["ISOBARIC", "HYPERBARIC"])
  })

  it("omits an option with no dosing surface rather than mapping it to undefined", () => {
    const map = drugBaseProfilesMap([BUPIVACAINE, SALINE])
    expect(Object.keys(map)).toEqual(["Bupivacaine"])
    expect("Sodium chloride 0.9%" in map).toBe(false)
  })

  it("leaves metadata the drug never stated undefined", () => {
    const map = drugBaseProfilesMap([PROPOFOL])
    expect(map.Propofol.defaultFormulation).toBeUndefined()
    expect(map.Propofol.formulationOptions).toBeUndefined()
  })
})

describe("drugRouteProfilesMap", () => {
  it("keys each route by its canonical code, not the label the library used", () => {
    const map = drugRouteProfilesMap([BUPIVACAINE])
    // The library writes "PD"; the sheets look the route up as EPIDURAL.
    expect(Object.keys(map.Bupivacaine).sort()).toEqual(["EPIDURAL", "IV"])
    expect(map.Bupivacaine.PD).toBeUndefined()
  })

  it("lets a route's own formulation beat the drug's default", () => {
    const map = drugRouteProfilesMap([BUPIVACAINE])
    expect(map.Bupivacaine.EPIDURAL.defaultFormulation).toBe("HYPERBARIC")
    expect(map.Bupivacaine.IV.defaultFormulation).toBe("ISOBARIC")
  })

  it("keeps each route's own dosing range", () => {
    const map = drugRouteProfilesMap([BUPIVACAINE])
    expect(map.Bupivacaine.IV).toMatchObject({ max: 10, unit: "mg/hr" })
    expect(map.Bupivacaine.EPIDURAL).toMatchObject({ max: 20, unit: "mL/hr" })
  })

  it("omits an option with no routes at all", () => {
    const map = drugRouteProfilesMap([BUPIVACAINE, SALINE])
    expect(Object.keys(map)).toEqual(["Bupivacaine"])
  })
})
