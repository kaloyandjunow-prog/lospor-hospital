import { describe, expect, it } from "vitest"
import { parseDoseProfile } from "./catalog"
import {
  canonicalConcentrationSelection,
  resolveDrugSelectionSurface,
} from "./drug-selection"

const profile = parseDoseProfile("Bupivacaine", "bolus", {
  routes: ["IV", "IT"],
  defaultRoute: "IT",
  rounding: "nearest_step",
  routeModes: {
    IV: {
      min: 0,
      max: 20,
      step: 1,
      unit: "mg",
      quickValues: [1, 2, 3, 4, 5, 6],
      doseCalc: { perKg: 0.1, basis: "TBW", roundTo: 1 },
    },
    IT: {
      min: 0,
      max: 5,
      step: 0.1,
      unit: "mg",
      quickValues: [0.5, 1, 1.5, 2],
      doseCalc: { flat: 1.2, roundTo: 0.1 },
      concentrationOptions: ["0.25%", "0.5%"],
      concentrationUnit: "PERCENT",
      defaultConcentration: "0.5%",
      formulationOptions: ["ISOBARIC", "HYPERBARIC"],
      defaultFormulation: "HYPERBARIC",
    },
  },
})

describe("drug selection surface", () => {
  it("preselects the configured route and every dependent field", () => {
    expect(resolveDrugSelectionSurface({ profile, patient: { totalBodyWeightKg: 20 } })).toMatchObject({
      route: "INTRATHECAL",
      dose: "1.2",
      unit: "mg",
      concentration: "0.5%",
      formulation: "HYPERBARIC",
      quickValues: [0.5, 1, 1.5, 2],
    })
  })

  it("reinitializes the full surface when route changes", () => {
    expect(resolveDrugSelectionSurface({
      profile,
      route: "IV",
      patient: { totalBodyWeightKg: 20 },
    })).toMatchObject({
      route: "IV",
      dose: "2",
      min: 0,
      max: 20,
      quickValues: [1, 2, 3, 4, 5, 6],
      concentration: "",
      formulationOptions: [],
    })
  })

  it("requires IBW when configured and never falls back to TBW", () => {
    const ibwProfile = parseDoseProfile("Example", "bolus", {
      min: 0,
      max: 200,
      step: 1,
      unit: "mg",
      routes: ["IV"],
      doseCalc: { perKg: 1, basis: "IBW", roundTo: 1 },
    })
    expect(resolveDrugSelectionSurface({
      profile: ibwProfile,
      patient: { totalBodyWeightKg: 100 },
    })).toMatchObject({ dose: "", calculationUnavailableReason: "MISSING_IBW" })
  })

  it("preserves the adult v7.3.2 weight fallback when requested", () => {
    const ibwProfile = parseDoseProfile("Example", "bolus", {
      min: 0,
      max: 200,
      step: 1,
      unit: "mg",
      routes: ["IV"],
      doseCalc: { perKg: 1, basis: "IBW", roundTo: 1 },
    })
    expect(resolveDrugSelectionSurface({
      profile: ibwProfile,
      patient: { totalBodyWeightKg: 100 },
      allowWeightBasisFallback: true,
    })).toMatchObject({ dose: "100", calculation: { basis: "IBW", calculationWeight: 100 } })
  })

  it("parses canonical concentration values and units", () => {
    expect(canonicalConcentrationSelection("0.5%", "PERCENT")).toEqual({
      label: "0.5%",
      value: 0.5,
      unit: "PERCENT",
    })
  })
})

/**
 * Quick values are authored per drug, not per patient. A paediatric band spans
 * a wide range of sizes, so its pills are sized for the largest child it covers
 * and a small child is offered a dose meant for someone many times their weight
 * — one tap away, looking exactly as legitimate as the right one.
 */
describe("quick values are kept plausible for the patient in front of you", () => {
  // A single band covering neonate to adolescent, as the real profiles do.
  const wideBand = parseDoseProfile("Propofol", "bolus", {
    routes: ["IV"],
    rounding: "nearest_step",
    min: 0,
    max: 400,
    step: 1,
    unit: "mg",
    quickValues: [5, 10, 20, 50, 100, 200, 400],
    doseCalc: { perKg: 2.5, basis: "TBW", roundTo: 1 },
  })
  const neonate = { totalBodyWeightKg: 4 }

  it("drops the pills a small child could not plausibly receive", () => {
    const surface = resolveDrugSelectionSurface({
      profile: wideBand,
      patient: neonate,
      clampQuickValuesToCalculatedDose: true,
    })
    // 2.5 mg/kg x 4 kg = 10 mg, so nothing above 30 mg survives.
    expect(surface.dose).toBe("10")
    expect(surface.quickValues).toEqual([5, 10, 20])
  })

  it("leaves the slider and its maximum alone — this is not a dose limit", () => {
    const surface = resolveDrugSelectionSurface({
      profile: wideBand,
      patient: neonate,
      clampQuickValuesToCalculatedDose: true,
    })
    // The larger dose remains reachable by slider or by typing it.
    expect(surface.max).toBe(400)
    expect(surface.min).toBe(0)
  })

  it("keeps an adolescent's full ladder", () => {
    const surface = resolveDrugSelectionSurface({
      profile: wideBand,
      patient: { totalBodyWeightKg: 60 },
      clampQuickValuesToCalculatedDose: true,
    })
    expect(surface.dose).toBe("150")
    expect(surface.quickValues).toEqual([5, 10, 20, 50, 100, 200, 400])
  })

  it("does not touch adult profiles, whose ladders are authored for adults", () => {
    // Sugammadex is the reason this is opt-in: 2 mg/kg is routine reversal, but
    // 16 mg/kg for immediate reversal is a legitimate pill that must stay.
    const sugammadex = parseDoseProfile("Sugammadex", "bolus", {
      routes: ["IV"],
      rounding: "nearest_step",
      min: 0,
      max: 1200,
      step: 10,
      unit: "mg",
      quickValues: [100, 200, 400, 600, 1200],
      doseCalc: { perKg: 2, basis: "TBW", roundTo: 10 },
    })
    const surface = resolveDrugSelectionSurface({
      profile: sugammadex,
      patient: { totalBodyWeightKg: 70 },
    })
    expect(surface.quickValues).toEqual([100, 200, 400, 600, 1200])
  })

  it("offers the calculated dose when every authored pill is too large", () => {
    const adultLadder = parseDoseProfile("Thiopental", "bolus", {
      routes: ["IV"],
      rounding: "nearest_step",
      min: 0,
      max: 500,
      step: 1,
      unit: "mg",
      quickValues: [100, 200, 300, 400, 500],
      doseCalc: { perKg: 4, basis: "TBW", roundTo: 1 },
    })
    const surface = resolveDrugSelectionSurface({
      profile: adultLadder,
      patient: { totalBodyWeightKg: 3 },
      clampQuickValuesToCalculatedDose: true,
    })
    // 12 mg calculated; every pill exceeds 36 mg, so the row falls back to the
    // suggestion already shown rather than going empty.
    expect(surface.dose).toBe("12")
    expect(surface.quickValues).toEqual([12])
  })

  it("leaves the pills alone when no dose could be calculated", () => {
    // No weight recorded: the authored pills are all the clinician has.
    const surface = resolveDrugSelectionSurface({
      profile: wideBand,
      patient: {},
      clampQuickValuesToCalculatedDose: true,
    })
    expect(surface.dose).toBe("")
    expect(surface.quickValues).toEqual([5, 10, 20, 50, 100, 200, 400])
  })
})
