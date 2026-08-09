import { describe, expect, it } from "vitest"
import {
  ADMINISTRATION_ROUTE_CODES,
  canonicalConcentrationUnit,
  canonicalDoseUnit,
  canonicalizeDoseProfile,
  normalizeAdministrationRoute,
} from "./clinical-rule-vocabulary"

describe("clinical rule route vocabulary", () => {
  it("normalizes supported legacy aliases including sublingual", () => {
    expect(normalizeAdministrationRoute("PD")).toBe("EPIDURAL")
    expect(normalizeAdministrationRoute("IT")).toBe("INTRATHECAL")
    expect(normalizeAdministrationRoute("Peripheral nerve block")).toBe("PERINEURAL")
    expect(normalizeAdministrationRoute("Local infiltration")).toBe("INFILTRATION")
    expect(normalizeAdministrationRoute("SL")).toBe("SL")
    expect(normalizeAdministrationRoute("Sublingual")).toBe("SL")
    expect(ADMINISTRATION_ROUTE_CODES).toContain("PO")
    expect(ADMINISTRATION_ROUTE_CODES).toContain("SL")
  })

  it("stores familiar display units with exact UCUM codes", () => {
    expect(canonicalDoseUnit("mcg/kg/min", "IBW")).toEqual({
      amount: "MCG",
      bodyBasis: "IBW",
      timeBasis: "MINUTE",
      display: "mcg/kg/min",
      ucumCode: "ug/(kg.min)",
    })
    expect(canonicalDoseUnit("IU/hr")).toMatchObject({
      display: "IU/hr",
      ucumCode: "[IU]/(h)",
    })
    expect(canonicalConcentrationUnit("mEq/mL")).toEqual({
      kind: "MEQ_PER_ML",
      display: "mEq/mL",
      ucumCode: "meq/mL",
    })
  })

  it("canonicalizes route-keyed profile data while retaining SL", () => {
    const profile = canonicalizeDoseProfile({
      kind: "bolus",
      mode: "dose",
      min: 0,
      max: 10,
      step: 1,
      rounding: "nearest_step",
      quickValues: [1, 2],
      unit: "mg",
      routes: ["PD", "IT", "PO", "SL"],
      weightBasis: "none",
      doseCalcByRoute: {
        PD: { flat: 1 },
        SL: { flat: 2 },
      },
    })
    expect(profile.routes).toEqual(["EPIDURAL", "INTRATHECAL", "PO", "SL"])
    expect(profile.doseCalcByRoute).toEqual({ EPIDURAL: { flat: 1 }, SL: { flat: 2 } })
  })
})
