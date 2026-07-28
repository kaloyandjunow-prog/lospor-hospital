import { describe, expect, it } from "vitest"
import { calcBMI, calcRCRI, calcAldreteTotal } from "./scores"
import { calcSuggestedDose, suggestedDoseFromWeights } from "./dosing"
import { addMinutes, calcDuration, packLaneRows } from "./timetable"
import { suggestRcriCreatinine, suggestStopBangBP } from "./risk"
import { getIcd10BodySystem } from "./preop"

describe("@lospor/core", () => {
  it("calculates common risk and score helpers", () => {
    expect(calcBMI(180, 81)).toBe(25)
    expect(calcRCRI({
      highRiskSurgery: true,
      ischaemicHeartDisease: false,
      congestiveHeartFailure: true,
      cerebrovascularDisease: false,
      insulinDependentDiabetes: false,
      creatinineHigh: true,
    })).toBe(3)
    expect(calcAldreteTotal([2, 1, null, undefined, 2])).toBe(5)
  })

  it("calculates suggested dosing from shared dose rules", () => {
    expect(suggestedDoseFromWeights({ perKg: 2, roundTo: 10 }, undefined, 70, 90).dose).toBe("140")
    expect(calcSuggestedDose({ flat: 100 }, undefined, { heightCm: 180, weightKg: 80, sex: "MALE" }).dose).toBe("100")
  })

  it("handles timetable math and lane packing", () => {
    expect(addMinutes("23:55", 10)).toBe("00:05")
    expect(calcDuration("23:30", "00:10", 0)).toBe("40min")
    expect(packLaneRows([{ startCol: 0, endCol: 2 }, { startCol: 1, endCol: 3 }, { startCol: 4, endCol: 5 }])).toHaveLength(2)
  })

  it("derives coded clinical suggestions", () => {
    expect(suggestRcriCreatinine([{ test: "Creatinine", value: "220", unit: "umol/L" }])).toBe(true)
    expect(suggestStopBangBP([{ code: "I10" }], [])).toBe(true)
    expect(getIcd10BodySystem("K35")).toBe("Gastrointestinal / Hepatic")
  })
})
