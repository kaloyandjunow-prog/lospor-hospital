import { describe, expect, it } from "vitest"
import {
  getMedicationWarnings,
  suggestRcriCHF,
  suggestRcriCreatinine,
  suggestRcriInsulinDM,
  suggestStopBangBP,
  suggestsDifficultAirwayEquipment,
} from "./risk-derivation"

describe("risk derivation", () => {
  it("detects RCRI and STOP-BANG suggestions from coded data", () => {
    expect(suggestRcriCHF([{ code: "I50.1", label: "Heart failure" }])).toBe(true)
    expect(suggestRcriInsulinDM([], [{ atcCode: "A10AB01", label: "Insulin" }])).toBe(true)
    expect(suggestStopBangBP([{ code: "I10" }], [])).toBe(true)
  })

  it("detects creatinine thresholds by unit", () => {
    expect(suggestRcriCreatinine([{ test: "Creatinine", value: "190", unit: "umol/L" }])).toBe(true)
    expect(suggestRcriCreatinine([{ test: "Creatinine", value: "2.1", unit: "mg/dL" }])).toBe(true)
    expect(suggestRcriCreatinine([{ test: "Creatinine", value: "1.2", unit: "mg/dL" }])).toBe(false)
  })

  it("returns medication warnings by ATC class", () => {
    const warnings = getMedicationWarnings([
      { atcCode: "B01AF01" },
      { atcCode: "H02AB06" },
      { atcCode: "C07AB02" },
    ])

    expect(warnings.map(w => w.key)).toEqual(["anticoagulant", "steroid", "betablocker"])
  })

  it("flags difficult airway equipment from current exam findings", () => {
    expect(suggestsDifficultAirwayEquipment({ mallampati: "III" })).toBe(true)
    expect(suggestsDifficultAirwayEquipment({ mouthOpeningCm: 2.5 })).toBe(true)
    expect(suggestsDifficultAirwayEquipment({ mallampati: "II", neckMobility: "FULL" })).toBe(false)
  })
})
