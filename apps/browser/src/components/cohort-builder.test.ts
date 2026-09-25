import { describe, expect, it } from "vitest"
import type { ResearchCohortDefinition } from "@lospor/core/research"
import {
  buildCohort,
  formFromCohort,
  preservedCohortFilters,
  researchMonthEnd,
  researchMonthStart,
} from "./cohort-builder"

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

  it("round-trips every currently supported cohort filter", () => {
    const definition: ResearchCohortDefinition = {
      version: 1,
      filters: {
        statuses: ["IN_PROGRESS", "COMPLETE"],
        clinicalModes: ["ADULT", "PEDIATRIC"],
        finalized: { from: "2026-01-03", to: "2026-06-27" },
        ageDays: { min: 3, max: 720 },
        bmi: { min: 16, max: 42 },
        durationMinutes: { min: 20, max: 480 },
        aldreteTotal: { min: 7, max: 10 },
        painScore: { min: 0, max: 4 },
        sex: ["FEMALE", "OTHER"],
        asa: ["II", "III"],
        emergency: false,
        highRisk: true,
        ponv: false,
        diagnosisCodes: ["C61", "I10"],
        diagnosisText: "diagnosis text",
        comorbidityCodes: ["E11"],
        comorbidityText: "comorbidity text",
        procedureCodes: ["PROC-1"],
        procedureText: "procedure text",
        procedureGroups: ["GROUP-A", "GROUP-B"],
        techniques: ["GENERAL_BALANCED"],
        positions: ["SUPINE"],
        airwayDevices: ["ORAL_ETT"],
        monitoring: ["ECG", "NIBP"],
        medications: ["propofol", "succinylcholine"],
        atcCodes: ["N01AX10"],
        complications: ["PONV"],
        dispositions: ["WARD"],
        mappingStatuses: ["MAPPED", "SOURCE_ONLY"],
        minimumCompleteness: 85,
      },
    }

    expect(buildCohort(
      formFromCohort(definition),
      preservedCohortFilters(definition),
    )).toEqual(definition)
  })

  it("preserves future server filters that this Browser does not understand", () => {
    const future = {
      version: 1,
      filters: {
        statuses: ["COMPLETE"],
        futureControlledFilter: { mode: "EXACT" },
      },
    } as unknown as ResearchCohortDefinition
    const rebuilt = buildCohort(formFromCohort(future), preservedCohortFilters(future))
    expect((rebuilt.filters as Record<string, unknown>).futureControlledFilter)
      .toEqual({ mode: "EXACT" })
  })
})

describe("the coded filters that replaced free text", () => {
  it("round-trips a preop answer and an intraop drug filter", () => {
    const cohort = buildCohort({
      preopQuestion: "A12_PACEMAKER_ICD",
      preopStates: "YES, NOT_ASKED",
      intraopAtcCode: "N02AB03",
      asa: "III, IV",
    })
    expect(cohort.filters.preopAnswers).toEqual([{ stableKey: "A12_PACEMAKER_ICD", states: ["YES", "NOT_ASKED"] }])
    expect(cohort.filters.intraopAtcCodes).toEqual(["N02AB03"])
    expect(cohort.filters.asa).toEqual(["III", "IV"])

    const form = formFromCohort(cohort)
    expect(form).toMatchObject({ preopQuestion: "A12_PACEMAKER_ICD", preopStates: "YES, NOT_ASKED", intraopAtcCode: "N02AB03" })
  })

  it("sends no preop answer filter until both the question and an answer are chosen", () => {
    expect(buildCohort({ preopQuestion: "A12_PACEMAKER_ICD" }).filters.preopAnswers).toBeUndefined()
  })
})

describe("the hospital-system import filter", () => {
  it("round-trips accepted and not accepted", () => {
    expect(buildCohort({ ehrImported: "true" }).filters.ehrImported).toBe(true)
    expect(buildCohort({ ehrImported: "false" }).filters.ehrImported).toBe(false)
    expect(buildCohort({}).filters.ehrImported).toBeUndefined()
    expect(formFromCohort(buildCohort({ ehrImported: "false" })).ehrImported).toBe("false")
  })
})
