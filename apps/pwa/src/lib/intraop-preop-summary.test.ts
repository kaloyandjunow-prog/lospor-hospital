import { describe, expect, it } from "vitest"
import { buildIntraopPreopSummary } from "./intraop-preop-summary"

describe("buildIntraopPreopSummary", () => {
  it("maps canonical preop patient fields for intraop display", () => {
    expect(buildIntraopPreopSummary({
      ageYears: "45",
      weightKg: "82",
      heightCm: "178",
      sex: "MALE",
      mallampati: "II",
      neckMobility: "Normal",
      mouthOpeningCm: "4.5",
      cormackLehane: "I",
      comorbidities: [{ label: "HTN", code: "I10" }],
      currentMedications: [{ label: "Metformin", atcCode: "A10BA02" }],
    })).toEqual({
      age: 45,
      weight: 82,
      height: 178,
      sex: "MALE",
      mallampati: "II",
      neckMobility: "Normal",
      mouthOpeningCm: 4.5,
      cormackLehane: "I",
      comorbidities: [{ label: "HTN", code: "I10" }],
      currentMedications: [{ label: "Metformin", atcCode: "A10BA02" }],
    })
  })

  it("falls back to legacy age/weight/height aliases", () => {
    expect(buildIntraopPreopSummary({
      age: 70,
      weight: 90,
      height: 180,
    })).toMatchObject({
      age: 70,
      weight: 90,
      height: 180,
      comorbidities: [],
      currentMedications: [],
    })
  })

  it("prefers canonical numeric fields over aliases", () => {
    expect(buildIntraopPreopSummary({
      ageYears: 50,
      age: 70,
      weightKg: 80,
      weight: 90,
      heightCm: 170,
      height: 180,
    })).toMatchObject({
      age: 50,
      weight: 80,
      height: 170,
    })
  })
})
