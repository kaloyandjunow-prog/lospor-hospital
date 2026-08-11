import { describe, expect, it } from "vitest"
import { doseProfileEditorIssues, effectiveRouteMode } from "./dose-profile-validation"
import type { DoseProfile } from "@lospor/core/catalog"

/**
 * This is the gate between someone typing a rule into the clinical-rules
 * console and the chart dosing from it.
 *
 * A profile that gets through with a gap does not fail loudly. It surfaces
 * later as a drug that quietly will not autofill, on a device, in front of a
 * patient, with nothing to connect the two events — which is why the gap has to
 * be caught here, while whoever authored it is still looking at the screen.
 */

function profile(over: Partial<DoseProfile> = {}): DoseProfile {
  return {
    kind: "bolus",
    mode: "dose",
    min: 0,
    max: 100,
    step: 1,
    rounding: "nearest_step",
    quickValues: [1, 2, 5],
    unit: "mg",
    routes: ["IV"],
    defaultRoute: "IV",
    weightBasis: "TBW",
    ...over,
  }
}

describe("a profile fit to publish", () => {
  it("accepts a complete one", () => {
    expect(doseProfileEditorIssues(profile())).toEqual([])
  })

  it("rejects one with no route at all", () => {
    expect(doseProfileEditorIssues(profile({ routes: [], defaultRoute: undefined })))
      .toContain("At least one route is required.")
  })

  it("rejects a default route the drug cannot be given by", () => {
    // Otherwise the chart opens on a route the profile does not describe.
    expect(doseProfileEditorIssues(profile({ routes: ["IV"], defaultRoute: "PO" })))
      .toContain("The default route must be one of the included routes.")
  })

  it("rejects a missing default route", () => {
    expect(doseProfileEditorIssues(profile({ defaultRoute: undefined })))
      .toContain("The default route must be one of the included routes.")
  })

  it("catches settings left behind for a route that was removed", () => {
    // Orphans are invisible in the editor and would be read by nothing, but
    // they make the authored rule and the stored rule disagree.
    const issues = doseProfileEditorIssues(profile({
      routes: ["IV"],
      routeModes: { PO: { mode: "dose", min: 0, max: 10, step: 1, quickValues: [], unit: "mg", weightBasis: "TBW" } },
    }))
    expect(issues.some(issue => issue.includes("orphan"))).toBe(true)
    expect(issues.some(issue => issue.includes("PO"))).toBe(true)
  })

  it("catches a route that resolves to nothing", () => {
    // No route settings of its own and no numbers to inherit: the route is
    // offered and then has no dose box.
    const issues = doseProfileEditorIssues(profile({
      routes: ["IV", "PO"],
      min: undefined,
      max: undefined,
      unit: undefined,
    }))
    expect(issues.some(issue => issue.includes("Complete the route settings"))).toBe(true)
  })
})

describe("a fluid profile's entry modes", () => {
  const fluid = (over: Partial<DoseProfile> = {}) => profile({ kind: "fluid", ...over })

  it("rejects a fluid with no way to enter it", () => {
    expect(doseProfileEditorIssues(fluid({ fluidEntryModes: [] })))
      .toContain("At least one fluid entry mode is required.")
  })

  it("rejects a default entry mode that was not offered", () => {
    expect(doseProfileEditorIssues(fluid({
      fluidEntryModes: ["VOLUME"],
      defaultFluidEntryMode: "RATE",
    }))).toContain("The default fluid entry mode must be one of the included modes.")
  })

  it("rejects rate settings on a fluid that cannot be given by rate", () => {
    // The settings would be unreachable, and their presence implies the fluid
    // can be run as an infusion when it cannot.
    expect(doseProfileEditorIssues(fluid({
      fluidEntryModes: ["VOLUME"],
      fluidRate: { calculation: "HOLLIDAY_SEGAR_4_2_1", min: 0, max: 999, step: 1, allowManualOutsideRange: true },
    }))).toContain("Rate settings require the Rate entry mode.")
  })

  it("accepts rate settings when the fluid offers the rate mode", () => {
    expect(doseProfileEditorIssues(fluid({
      fluidEntryModes: ["VOLUME", "RATE"],
      defaultFluidEntryMode: "RATE",
      fluidRate: { calculation: "HOLLIDAY_SEGAR_4_2_1", min: 0, max: 999, step: 1, allowManualOutsideRange: true },
    }))).toEqual([])
  })

  it("leaves a bolus profile's entry modes alone", () => {
    // Entry modes are a fluid concept; a bolus carrying none is not an error.
    expect(doseProfileEditorIssues(profile({ kind: "bolus" }))).toEqual([])
  })
})

describe("a route with no settings of its own", () => {
  it("inherits the drug's numbers", () => {
    const mode = effectiveRouteMode(profile({ routes: ["IV", "IM"] }), "IM")
    expect(mode).toMatchObject({ unit: "mg", min: 0, max: 100, step: 1 })
  })

  it("prefers its own settings when it has them", () => {
    const mode = effectiveRouteMode(profile({
      routes: ["IV", "IN"],
      routeModes: { IN: { mode: "dose", min: 0, max: 200, step: 10, quickValues: [50], unit: "mcg", weightBasis: "TBW" } },
    }), "IN")
    expect(mode).toMatchObject({ unit: "mcg", max: 200, step: 10 })
  })

  it("resolves to nothing when there is nothing to inherit", () => {
    expect(effectiveRouteMode(profile({ unit: undefined }), "IV")).toBeNull()
    expect(effectiveRouteMode(profile({ min: undefined }), "IV")).toBeNull()
  })

  it("takes a step from the variable-step ladder when none is stated", () => {
    const mode = effectiveRouteMode(profile({ step: undefined, variableStep: [{ upTo: 10, step: 0.5 }] }), "IV")
    expect(mode?.step).toBe(0.5)
  })

  it("prefers a per-route dose calculation over the drug's", () => {
    const mode = effectiveRouteMode(profile({
      routes: ["IV", "PO"],
      doseCalc: { perKg: 1, basis: "TBW" },
      doseCalcByRoute: { PO: { perKg: 2, basis: "TBW" } },
    }), "PO")
    expect(mode?.doseCalc).toMatchObject({ perKg: 2 })
  })

  it("hands back a copy, so editing one route cannot change another", () => {
    const source = profile({ routes: ["IV", "IM"], quickValues: [1, 2] })
    const first = effectiveRouteMode(source, "IV")
    first!.quickValues.push(99)
    expect(effectiveRouteMode(source, "IM")?.quickValues).toEqual([1, 2])
  })
})
