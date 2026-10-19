import { describe, expect, it } from "vitest"
import { infusionRateView, infusionStrengths, suggestedRateAt, switchInfusionUnit, type InfusionRateInput } from "./infusion-rate-view"
import { rateDialogChange } from "@/components/intraop/rate-dialog-surface"
import type { RateChangeState } from "@/components/intraop/RateChangeDialog"

// The web's infusion entry (2026-10-18), the same numbers as the PWA:
// noradrenaline 0.1 mcg/kg/min, 70 kg, 4 mg/50 mL is 5.25 mL/hr.
const noradrenaline: InfusionRateInput = {
  ruleUnit: "mcg/kg/min", entryUnit: "mcg/kg/min", value: 0.1,
  min: 0, max: 3, step: 0.01, quickValues: [0.05, 0.1], concentration: "4 mg/50 mL", weightKg: 70,
}

describe("the web infusion entry", () => {
  it("offers the units, keeps the rule's range, and reads out the pump rate", () => {
    expect(infusionRateView({ ...noradrenaline, onPumpLabel: "on the pump" })).toEqual({
      units: ["mcg/kg/min", "mcg/min", "mL/hr"], min: 0, max: 3, step: 0.01, quickValues: [0.05, 0.1],
      readout: "5.25 mL/hr on the pump",
    })
  })

  it("carries the value into the pump rate and reads out the dose rate there", () => {
    const pump = switchInfusionUnit({ ...noradrenaline, next: "mL/hr" })
    expect(pump).toEqual({ value: 5.3, entryUnit: "mL/hr", doseUnit: "mcg/kg/min" })
    expect(infusionRateView({ ...noradrenaline, entryUnit: "mL/hr", value: 10.5, onPumpLabel: "" }))
      .toMatchObject({ max: 157.5, step: 0.1, readout: "0.2 mcg/kg/min" })
  })

  it("offers a drug's syringes, the running one first when typed, and a local anaesthetic's %", () => {
    expect(infusionStrengths({ name: "Norepinephrine / Noradrenaline" }).options).toEqual(["1 mg/50 mL", "2 mg/50 mL", "4 mg/50 mL", "5 mg/50 mL", "10 mg/50 mL"])
    expect(infusionStrengths({ name: "Norepinephrine / Noradrenaline", running: "8 mg/50 mL" }).options[0]).toBe("8 mg/50 mL")
    expect(infusionStrengths({ name: "Ropivacaine", localAnaesthetic: ["0.1%", "0.2%"] })).toEqual({ options: ["0.1%", "0.2%"], syringe: false })
    expect(infusionStrengths({ name: "Epoprostenol" })).toEqual({ options: [], syringe: true })
  })

  it("suggests only for a dose-limited volume in its own unit", () => {
    const ropivacaine: InfusionRateInput = { ruleUnit: "mL/kg/hr", entryUnit: "mL/kg/hr", value: 0.3, min: 0, max: 0.5, step: 0.01, doseLimit: { unit: "mg/kg/hr", max: 0.4, suggested: 0.3 }, weightKg: 12 }
    expect(suggestedRateAt(ropivacaine, "0.2%")).toBe(0.15)
    expect(suggestedRateAt(noradrenaline, "4 mg/50 mL")).toBeUndefined()
  })
})

describe("what a web rate change records", () => {
  const state: RateChangeState = {
    name: "Norepinephrine / Noradrenaline", rate: 10.5, unit: "mL/hr", units: ["mcg/kg/min"],
    rateMin: 0, rateMax: 3, rateStep: 0.01, color: "#a855f7", step: "rate", timeH: "", timeM: "",
    concentration: "4 mg/50 mL", ruleUnit: "mcg/kg/min", doseUnit: "mcg/kg/min", weightKg: 70,
  }

  it("is both rates whatever unit it was entered in", () => {
    expect(rateDialogChange(state)).toEqual({ rate: 0.2, unit: "mcg/kg/min", concentration: "4 mg/50 mL", volumeRateMlPerHour: 10.5 })
    expect(rateDialogChange({ ...state, rate: 0.2, unit: "mcg/kg/min" })).toEqual({ rate: 0.2, unit: "mcg/kg/min", concentration: "4 mg/50 mL", volumeRateMlPerHour: 10.5 })
  })

  it("is the dose rate alone without a syringe, or a volume rate if entered in mL/hr", () => {
    expect(rateDialogChange({ ...state, concentration: undefined, rate: 0.2, unit: "mcg/kg/min" })).toEqual({ rate: 0.2, unit: "mcg/kg/min", concentration: undefined })
    expect(rateDialogChange({ ...state, concentration: undefined })).toEqual({ rate: 10.5, unit: "mL/hr", concentration: undefined, volumeRateMlPerHour: 10.5 })
  })
})
