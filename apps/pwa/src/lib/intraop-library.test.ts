import { describe, expect, it } from "vitest"
import type { LibraryOption } from "@/lib/use-option-library"
import {
  quickNumberMap, quickStringMap, routesMap, concentrationsMap, defaultConcentrationMap,
  suggestedRateMap, strictRangeMap, defaultedRangeMap, routeProfilesMap, baseProfilesMap,
  doseCalcMap, codesMap, groupDrugCategories, groupClinicalEvents, canStartDrugAsInfusion,
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
