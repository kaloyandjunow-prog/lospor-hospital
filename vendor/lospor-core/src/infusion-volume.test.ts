import { describe, expect, it } from "vitest"
import { INFUSION_CATALOG } from "./catalog"
import {
  alternativeDoseUnits,
  convertDoseRate,
  doseRateFromPump,
  formatSyringe,
  infusionVolumeMl,
  infusionVolumesByName,
  parseDoseRateUnit,
  parseSyringe,
  pumpRateMlPerHour,
  roundRate,
  syringeOptions,
  customSyringe,
  customSyringeFields,
  syringeAmountUnits,
} from "./infusion-volume"

describe("syringe strengths", () => {
  it("are written and read back the same", () => {
    expect(formatSyringe({ amount: 4, amountUnit: "mg", volumeMl: 50 })).toBe("4 mg/50 mL")
    expect(parseSyringe("4 mg/50 mL")).toEqual({ amount: 4, amountUnit: "mg", volumeMl: 50 })
    expect(parseSyringe("12,5 mg / 250 mL")).toEqual({ amount: 12.5, amountUnit: "mg", volumeMl: 250 })
    expect(parseSyringe("25000 iu/50 mL")).toEqual({ amount: 25000, amountUnit: "IU", volumeMl: 50 })
    expect(parseSyringe("0.2%")).toBeNull()
    expect(parseSyringe("0 mg/50 mL")).toBeNull()
  })

  it("offers the approved list, and a route's own where it has one", () => {
    expect(syringeOptions("Norepinephrine / Noradrenaline").map(formatSyringe)).toContain("4 mg/50 mL")
    expect(syringeOptions("Fentanyl", "EPIDURAL").map(formatSyringe)).toEqual(["100 mcg/50 mL"])
    expect(syringeOptions("Fentanyl", "IV").map(formatSyringe)).toEqual(["500 mcg/50 mL", "2500 mcg/50 mL"])
    expect(syringeOptions("Epoprostenol")).toEqual([])
  })

  it("only lists drugs in the catalogue, and every strength converts to the drug's own unit", () => {
    const names = new Set(INFUSION_CATALOG.map(entry => entry.name))
    for (const entry of INFUSION_CATALOG) {
      const profile = entry.profile as { unit?: string; routeModes?: Record<string, { unit: string }> }
      for (const strength of syringeOptions(entry.name)) {
        const units = [profile.unit, ...Object.values(profile.routeModes ?? {}).map(mode => mode.unit)]
          .filter((unit): unit is string => !!unit && !/^mL\//i.test(unit))
        for (const unit of units) {
          const rate = pumpRateMlPerHour({ rate: 1, unit, concentration: formatSyringe(strength), weightKg: 70 })
          expect(rate, `${entry.name} ${unit} with ${formatSyringe(strength)}`).not.toBeNull()
        }
      }
    }
    for (const name of Object.keys(Object.fromEntries(INFUSION_CATALOG.map(entry => [entry.name, true])))) expect(names.has(name)).toBe(true)
  })
})

describe("dose rate and pump rate", () => {
  it("works out the pump rate of a weight-based infusion", () => {
    // Noradrenaline 0.1 mcg/kg/min, 70 kg, 4 mg/50 mL (80 mcg/mL): 420 mcg/hr = 5.25 mL/hr.
    expect(pumpRateMlPerHour({ rate: 0.1, unit: "mcg/kg/min", concentration: "4 mg/50 mL", weightKg: 70 })).toBeCloseTo(5.25, 6)
    // Propofol 6 mg/kg/hr, 80 kg, 1%: 480 mg/hr = 48 mL/hr.
    expect(pumpRateMlPerHour({ rate: 6, unit: "mg/kg/hr", concentration: "500 mg/50 mL", weightKg: 80 })).toBeCloseTo(48, 6)
    // Heparin 1000 IU/hr from 25000 IU/50 mL: 2 mL/hr.
    expect(pumpRateMlPerHour({ rate: 1000, unit: "IU/hr", concentration: "25000 IU/50 mL" })).toBeCloseTo(2, 6)
    // A % strength reads as mg/mL: ropivacaine 0.2% at 16 mg/hr is 8 mL/hr.
    expect(pumpRateMlPerHour({ rate: 16, unit: "mg/hr", concentration: "0.2%" })).toBeCloseTo(8, 6)
  })

  it("needs no strength for a volume rate", () => {
    expect(pumpRateMlPerHour({ rate: 8, unit: "mL/hr" })).toBe(8)
    expect(pumpRateMlPerHour({ rate: 0.2, unit: "mL/kg/hr", weightKg: 12 })).toBeCloseTo(2.4, 6)
    expect(pumpRateMlPerHour({ rate: 0.2, unit: "mL/kg/hr" })).toBeNull()
  })

  it("never guesses: no strength, no weight for per-kg, or units that do not convert", () => {
    expect(pumpRateMlPerHour({ rate: 0.1, unit: "mcg/kg/min", concentration: undefined, weightKg: 70 })).toBeNull()
    expect(pumpRateMlPerHour({ rate: 0.1, unit: "mcg/kg/min", concentration: "4 mg/50 mL" })).toBeNull()
    expect(pumpRateMlPerHour({ rate: 1, unit: "mmol/kg/hr", concentration: "4 g/50 mL", weightKg: 20 })).toBeNull()
    expect(pumpRateMlPerHour({ rate: 1, unit: "mg/m2/hr", concentration: "4 mg/50 mL" })).toBeNull()
  })

  it("turns a pump rate back into the dose rate", () => {
    expect(doseRateFromPump({ mlPerHour: 5.25, unit: "mcg/kg/min", concentration: "4 mg/50 mL", weightKg: 70 })).toBeCloseTo(0.1, 6)
    expect(doseRateFromPump({ mlPerHour: 48, unit: "mg/hr", concentration: "500 mg/50 mL" })).toBeCloseTo(480, 6)
    expect(doseRateFromPump({ mlPerHour: 5, unit: "mcg/kg/min", concentration: undefined, weightKg: 70 })).toBeNull()
  })
})

describe("more than one dose unit", () => {
  it("offers per kg and not per kg of the same amount and time", () => {
    expect(alternativeDoseUnits("mcg/kg/min")).toEqual(["mcg/kg/min", "mcg/min"])
    expect(alternativeDoseUnits("mg/hr")).toEqual(["mg/hr", "mg/kg/hr"])
    expect(alternativeDoseUnits("mL/kg/hr")).toEqual(["mL/kg/hr"])
    // No per-kg twin where nobody doses per kg; mcg/kg/min too for propofol and the relaxants.
    expect(alternativeDoseUnits("mg/min")).toEqual(["mg/min"])
    expect(alternativeDoseUnits("mcg/min")).toEqual(["mcg/min", "mcg/kg/min"])
    expect(alternativeDoseUnits("IU/min")).toEqual(["IU/min"])
    expect(alternativeDoseUnits("g/hr")).toEqual(["g/hr"])
    expect(alternativeDoseUnits("mmol/hr")).toEqual(["mmol/hr"])
    expect(alternativeDoseUnits("IU/kg/hr")).toEqual(["IU/kg/hr", "IU/hr"])
    expect(alternativeDoseUnits("mg/kg/hr", "Propofol")).toEqual(["mg/kg/hr", "mg/hr", "mcg/kg/min"])
    expect(alternativeDoseUnits("mg/kg/hr", "Ketamine")).toEqual(["mg/kg/hr", "mg/hr"])
    expect(parseDoseRateUnit("ng/kg/min")).toEqual({ amountUnit: "ng", perKg: true, perMinute: true })
  })

  it("converts between them with the weight", () => {
    expect(convertDoseRate(0.1, "mcg/kg/min", "mcg/min", 70)).toBeCloseTo(7, 6)
    expect(convertDoseRate(480, "mg/hr", "mg/kg/hr", 80)).toBeCloseTo(6, 6)
    expect(convertDoseRate(0.1, "mcg/kg/min", "mcg/min", null)).toBeNull()
    // Across minutes and hours too: propofol 6 mg/kg/hr is 100 mcg/kg/min.
    expect(convertDoseRate(6, "mg/kg/hr", "mcg/kg/min", null)).toBeCloseTo(100, 6)
    expect(convertDoseRate(1, "mg/hr", "mcg/min", 70)).toBeCloseTo(16.667, 3)
    expect(convertDoseRate(1, "IU/hr", "mg/hr", 70)).toBeNull()
    expect(roundRate(5.2500001)).toBe(5.25)
    expect(roundRate(0.0833333)).toBe(0.083)
  })
})

describe("the millilitres an infusion gave", () => {
  const start = "2026-10-18T10:00:00.000Z"
  it("integrates the pump rate through every change, to 0.1 mL", () => {
    expect(infusionVolumeMl({
      startTs: start,
      endTs: "2026-10-18T11:30:00.000Z",
      volumeRateMlPerHour: 5.25,
      rateChanges: [{ ts: "2026-10-18T11:00:00.000Z", volumeRateMlPerHour: 10.5 }],
    })).toBe(10.5)
  })

  it("counts a running infusion up to now", () => {
    expect(infusionVolumeMl({ startTs: start, volumeRateMlPerHour: 6 }, "2026-10-18T10:20:00.000Z")).toBe(2)
  })

  it("gives no total when any stretch has no pump rate, or the syringe was skipped", () => {
    expect(infusionVolumeMl({ startTs: start, endTs: "2026-10-18T11:00:00.000Z" })).toBeNull()
    expect(infusionVolumeMl({
      startTs: start, endTs: "2026-10-18T11:00:00.000Z", volumeRateMlPerHour: 5,
      rateChanges: [{ ts: "2026-10-18T10:30:00.000Z" }],
    })).toBeNull()
  })

  it("ignores planned changes and planned infusions", () => {
    expect(infusionVolumeMl({
      startTs: start, endTs: "2026-10-18T11:00:00.000Z", volumeRateMlPerHour: 4,
      rateChanges: [{ ts: "2026-10-18T10:30:00.000Z", planned: true }],
    })).toBe(4)
    expect(infusionVolumeMl({ planned: true, startTs: start, volumeRateMlPerHour: 4 })).toBe(0)
  })
})

describe("each drug's infused millilitres", () => {
  it("sums its infusions, or gives none when any lacks a pump rate", () => {
    const ran = (name: string, rate?: number) => ({ name, startTs: "2026-10-18T10:00:00.000Z", endTs: "2026-10-18T11:00:00.000Z", volumeRateMlPerHour: rate })
    const byName = infusionVolumesByName([ran("Propofol", 10), ran("Propofol", 2.5), ran("Remifentanil", 4), ran("Remifentanil"), { ...ran("Ketamine", 3), planned: true }])
    expect(byName.get("Propofol")).toBe(12.5)
    expect(byName.get("Remifentanil")).toBeNull()
    expect(byName.has("Ketamine")).toBe(false)
  })
})

describe("a syringe typed with Other", () => {
  it("offers the amount units that convert to the drug's dose, the usual first", () => {
    expect(syringeAmountUnits("mcg/kg/min")).toEqual(["mg", "mcg"])
    expect(syringeAmountUnits("IU/kg/hr")).toEqual(["IU"])
    expect(syringeAmountUnits("ng/kg/min")).toEqual(["mcg", "mg", "ng"])
    expect(syringeAmountUnits("mL/kg/hr")).toEqual([])
  })

  it("gives the strength when it can be used", () => {
    expect(customSyringe({ amount: "8", amountUnit: "mg", volumeMl: "50", doseUnit: "mcg/kg/min" }))
      .toEqual({ label: "8 mg/50 mL", strength: { amount: 8, amountUnit: "mg", volumeMl: 50 } })
    expect(customSyringe({ amount: "12,5", amountUnit: "mg", volumeMl: "250", doseUnit: "mcg/kg/min" })).toMatchObject({ label: "12.5 mg/250 mL" })
  })

  it("says what is wrong instead of saving without a strength", () => {
    expect(customSyringe({ amount: "", amountUnit: "mg", volumeMl: "50", doseUnit: "mg/hr" })).toEqual({ error: "amount" })
    expect(customSyringe({ amount: "0", amountUnit: "mg", volumeMl: "50", doseUnit: "mg/hr" })).toEqual({ error: "amount" })
    expect(customSyringe({ amount: "8", amountUnit: "IU", volumeMl: "50", doseUnit: "mg/hr" })).toEqual({ error: "unit" })
    expect(customSyringe({ amount: "8", amountUnit: undefined, volumeMl: "50", doseUnit: "mg/hr" })).toEqual({ error: "unit" })
    expect(customSyringe({ amount: "8", amountUnit: "mg", volumeMl: "", doseUnit: "mg/hr" })).toEqual({ error: "volume" })
    expect(customSyringe({ amount: "8", amountUnit: "mg", volumeMl: "5000", doseUnit: "mg/hr" })).toEqual({ error: "volume" })
  })
})

describe("the sliders of a syringe typed with Other", () => {
  it("come from the drug's syringes, in the unit picked", () => {
    const { amount, volume } = customSyringeFields({ name: "Norepinephrine / Noradrenaline", amountUnit: "mg" })
    expect(amount).toEqual({ min: 0, max: 40, step: 0.2, quickValues: [1, 2, 4, 5, 10], prefill: 4 })
    expect(volume).toMatchObject({ min: 0, max: 1000, step: 1, prefill: 50 })
    expect(volume.quickValues).toEqual([10, 20, 50, 100, 250, 500])
    expect(customSyringeFields({ name: "Norepinephrine / Noradrenaline", amountUnit: "mcg" }).amount.quickValues).toEqual([1000, 2000, 4000, 5000, 10000])
  })

  it("fall back to usual amounts for a drug made up per patient", () => {
    const { amount } = customSyringeFields({ name: "Epoprostenol", amountUnit: "mcg" })
    expect(amount.quickValues).toEqual([50, 100, 500, 1000, 5000])
    expect(amount.prefill).toBe(500)
  })
})
