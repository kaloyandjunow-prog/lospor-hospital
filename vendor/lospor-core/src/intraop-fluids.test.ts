import { describe, expect, it } from "vitest"

import { parseDoseProfile } from "./catalog/dose-profile"
import {
  FLUID_RATE_SLIDER,
  calculateFluidVolumeMl,
  calculatePediatricMaintenanceRateMlPerHour,
  calculateRateFluidVolumeMl,
  isBloodProductFluid,
  isMaintenanceCompatibleFluid,
  resolveFluidEntryModeProfile,
  resolvePediatricMaintenanceWeightKg,
} from "./intraop-fluids"

const START = Date.parse("2026-08-02T08:00:00.000Z")
const atSeconds = (seconds: number) => new Date(START + seconds * 1_000).toISOString()

describe("fluid rate entry", () => {
  it("calculates 4/2/1 and applies the approved rounding", () => {
    expect(calculatePediatricMaintenanceRateMlPerHour(1)).toBe(4)
    expect(calculatePediatricMaintenanceRateMlPerHour(2)).toBe(8)
    expect(calculatePediatricMaintenanceRateMlPerHour(10)).toBe(40)
    expect(calculatePediatricMaintenanceRateMlPerHour(15)).toBe(50)
    expect(calculatePediatricMaintenanceRateMlPerHour(20)).toBe(60)
    expect(calculatePediatricMaintenanceRateMlPerHour(25)).toBe(70)
    expect(calculatePediatricMaintenanceRateMlPerHour(165)).toBe(210)
    expect(calculatePediatricMaintenanceRateMlPerHour(0)).toBeNull()
    expect(FLUID_RATE_SLIDER).toEqual({
      min: 1,
      max: 200,
      step: 1,
      allowManualOutsideRange: true,
    })
  })

  it("integrates real timestamps across rate changes and rounds only final mL", () => {
    expect(calculateRateFluidVolumeMl({
      startTs: atSeconds(0),
      endTs: atSeconds(1_800),
      rate: 100,
      rateChanges: [{ ts: atSeconds(900), rate: 200, unit: "mL/h" }],
    })).toBe(75)

    expect(calculateRateFluidVolumeMl({
      startTs: atSeconds(0),
      endTs: atSeconds(1_350),
      rate: 60,
      rateChanges: [{ ts: atSeconds(450), rate: 120, unit: "mL/h" }],
    })).toBe(38)
  })

  it("lets a clinician-entered delivered volume override integration", () => {
    expect(calculateRateFluidVolumeMl({
      startTs: atSeconds(0),
      endTs: atSeconds(3_600),
      rate: 100,
      administeredVolumeMl: 42.4,
    })).toBe(42)
    expect(calculateFluidVolumeMl({
      fluidEntryMode: "RATE",
      bagVolumeMl: 1_000,
      startTs: atSeconds(0),
      endTs: atSeconds(1_800),
      rate: 100,
    })).toBe(50)
  })

  it("uses TBW unless an explicit obesity decision selects McLaren IBW", () => {
    expect(resolvePediatricMaintenanceWeightKg({
      totalBodyWeightKg: 30,
      mclarenIdealBodyWeightKg: 20,
    })).toBe(30)
    expect(resolvePediatricMaintenanceWeightKg({
      totalBodyWeightKg: 30,
      mclarenIdealBodyWeightKg: 20,
      useIdealBodyWeight: true,
    })).toBe(20)
  })
})

describe("fluid product policy", () => {
  it("keeps blood products volume-only", () => {
    expect(isBloodProductFluid({ name: "Packed red blood cells (PRBC)" })).toBe(true)
    expect(resolveFluidEntryModeProfile({
      clinicalMode: "PEDIATRIC",
      name: "Fresh frozen plasma (FFP)",
      category: "Blood products",
    })).toMatchObject({
      fluidEntryModes: ["VOLUME"],
      defaultFluidEntryMode: "VOLUME",
    })
  })

  it("defaults pediatric non-blood products to rate but only marks maintenance products 4/2/1", () => {
    expect(resolveFluidEntryModeProfile({
      clinicalMode: "PEDIATRIC",
      name: "Plasma-Lyte",
      category: "Crystalloids",
    })).toMatchObject({
      fluidEntryModes: ["VOLUME", "RATE"],
      defaultFluidEntryMode: "RATE",
      fluidRate: { calculation: "HOLLIDAY_SEGAR_4_2_1" },
    })
    expect(resolveFluidEntryModeProfile({
      clinicalMode: "PEDIATRIC",
      name: "Mannitol",
      category: "Other",
    }).fluidRate.calculation).toBeUndefined()
  })

  it("excludes hypertonic saline and D10 rescue while allowing maintenance crystalloids", () => {
    expect(isMaintenanceCompatibleFluid({
      name: "Saline",
      category: "Crystalloids",
      concentration: "0.9%",
    })).toBe(true)
    expect(isMaintenanceCompatibleFluid({
      name: "Saline",
      category: "Crystalloids",
      concentration: "3%",
    })).toBe(false)
    expect(isMaintenanceCompatibleFluid({
      name: "Saline",
      category: "Crystalloids",
      concentration: "20%",
    })).toBe(false)
    expect(isMaintenanceCompatibleFluid({
      name: "Saline",
      category: "Crystalloids",
      concentration: "3.0%",
    })).toBe(false)
    expect(isMaintenanceCompatibleFluid({
      name: "Hypertonic saline 7.5%",
      category: "Crystalloids",
    })).toBe(false)
    expect(isMaintenanceCompatibleFluid({
      name: "Dextrose 5% in 0.9% saline (D5NS)",
      category: "Crystalloids",
    })).toBe(true)
    expect(isMaintenanceCompatibleFluid({
      name: "Dextrose 10% (D10W)",
      category: "Crystalloids",
    })).toBe(false)
  })

  it("does not let authored metadata re-enable 4/2/1 for special saline", () => {
    expect(resolveFluidEntryModeProfile({
      clinicalMode: "PEDIATRIC",
      name: "Saline",
      category: "Crystalloids",
      concentration: "3.0%",
      profile: {
        fluidEntryModes: ["VOLUME", "RATE"],
        defaultFluidEntryMode: "RATE",
        fluidRate: {
          min: 1,
          max: 200,
          step: 1,
          allowManualOutsideRange: true,
          calculation: "HOLLIDAY_SEGAR_4_2_1",
        },
      },
    }).fluidRate.calculation).toBeUndefined()
  })

  it("keeps the rate slider at 1-200 while allowing manual values outside it", () => {
    expect(resolveFluidEntryModeProfile({
      clinicalMode: "PEDIATRIC",
      name: "Ringer lactate",
      category: "Crystalloids",
      profile: {
        fluidEntryModes: ["VOLUME", "RATE"],
        defaultFluidEntryMode: "RATE",
        fluidRate: {
          min: 2,
          max: 150,
          step: 2,
          allowManualOutsideRange: false,
          calculation: "HOLLIDAY_SEGAR_4_2_1",
        },
      },
    }).fluidRate).toEqual({
      min: 1,
      max: 200,
      step: 1,
      allowManualOutsideRange: true,
      calculation: "HOLLIDAY_SEGAR_4_2_1",
    })
  })

  it("parses additive fluid entry-mode metadata without changing legacy profiles", () => {
    expect(parseDoseProfile("Legacy fluid", "fluid", {
      min: 0,
      max: 1_000,
      step: 10,
      unit: "mL",
    }).defaultFluidEntryMode).toBeUndefined()

    expect(parseDoseProfile("Rate fluid", "fluid", {
      min: 0,
      max: 1_000,
      step: 10,
      unit: "mL",
      fluidEntryModes: ["VOLUME", "RATE"],
      defaultFluidEntryMode: "RATE",
      fluidRate: {
        min: 1,
        max: 200,
        step: 1,
        allowManualOutsideRange: true,
        calculation: "HOLLIDAY_SEGAR_4_2_1",
      },
    })).toMatchObject({
      fluidEntryModes: ["VOLUME", "RATE"],
      defaultFluidEntryMode: "RATE",
      fluidRate: { min: 1, max: 200, step: 1, allowManualOutsideRange: true },
    })
  })
})
