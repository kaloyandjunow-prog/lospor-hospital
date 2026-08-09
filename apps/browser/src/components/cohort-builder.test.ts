import { describe, expect, it } from "vitest"
import { buildCohort, researchMonthEnd, researchMonthStart } from "./cohort-builder"

describe("cohort builder", () => {
  it("maps visible fields to the shared structured research contract", () => {
    const cohort = buildCohort({
      from: "2026-01",
      to: "2026-06",
      ageMin: "40",
      ageMax: "75",
      ageUnit: "YEARS",
      clinicalMode: "ADULT",
      bmiMin: "",
      bmiMax: "",
      sex: "MALE",
      asa: "II, III",
      emergency: "false",
      diagnosisCode: "C61, I10",
      diagnosisText: "",
      comorbidityCode: "E11",
      procedureCode: "PROC-1",
      procedureText: "",
      technique: "GENERAL_BALANCED",
      position: "SUPINE",
      airway: "ORAL_ETT",
      medication: "propofol",
      complication: "",
      disposition: "WARD",
      completeness: "90",
    })

    expect(cohort).toEqual({
      version: 1,
      filters: expect.objectContaining({
        statuses: ["COMPLETE"],
        finalized: { from: "2026-01-01", to: "2026-06-30" },
        ageYears: { min: 40, max: 75 },
        clinicalModes: ["ADULT"],
        sex: ["MALE"],
        asa: ["II", "III"],
        emergency: false,
        diagnosisCodes: ["C61", "I10"],
        comorbidityCodes: ["E11"],
        techniques: ["GENERAL_BALANCED"],
        dispositions: ["WARD"],
        minimumCompleteness: 90,
      }),
    })
  })

  it("does not emit empty optional filters", () => {
    const cohort = buildCohort({
      from: "",
      to: "",
      ageMin: "",
      ageMax: "",
      ageUnit: "YEARS",
      clinicalMode: "",
      bmiMin: "",
      bmiMax: "",
      sex: "",
      asa: "",
      emergency: "",
      diagnosisCode: "",
      diagnosisText: "",
      comorbidityCode: "",
      procedureCode: "",
      procedureText: "",
      technique: "",
      position: "",
      airway: "",
      medication: "",
      complication: "",
      disposition: "",
      completeness: "",
    })
    expect(cohort).toEqual({ version: 1, filters: { statuses: ["COMPLETE"] } })
  })

  it("maps pediatric month ranges to the canonical approximate-day filter", () => {
    const cohort = buildCohort({
      from: "",
      to: "",
      ageMin: "3",
      ageMax: "18",
      ageUnit: "MONTHS",
      clinicalMode: "PEDIATRIC",
      bmiMin: "",
      bmiMax: "",
      sex: "",
      asa: "",
      emergency: "",
      diagnosisCode: "",
      diagnosisText: "",
      comorbidityCode: "",
      procedureCode: "",
      procedureText: "",
      technique: "",
      position: "",
      airway: "",
      medication: "",
      complication: "",
      disposition: "",
      completeness: "",
    })

    expect(cohort.filters.clinicalModes).toEqual(["PEDIATRIC"])
    expect(cohort.filters.ageYears).toBeUndefined()
    expect(cohort.filters.ageDays?.min).toBeCloseTo(91.310625)
    expect(cohort.filters.ageDays?.max).toBeCloseTo(547.86375)
  })

  it("expands visible research months to inclusive API date boundaries", () => {
    expect(researchMonthStart("2026-02")).toBe("2026-02-01")
    expect(researchMonthEnd("2026-02")).toBe("2026-02-28")
    expect(researchMonthEnd("2028-02")).toBe("2028-02-29")
    expect(researchMonthStart("2026-13")).toBeUndefined()
    expect(researchMonthEnd("not-a-month")).toBeUndefined()
  })
})
