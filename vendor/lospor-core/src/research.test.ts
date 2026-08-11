import { describe, expect, it } from "vitest"
import {
  RESEARCH_BENCHMARK_METRIC_IDS,
  RESEARCH_DEFAULT_PAGE_SIZE,
  RESEARCH_MAX_PAGE_SIZE,
  RESEARCH_METRIC_IDS,
  activeResearchFilterCount,
  discloseResearchCount,
  makeResearchPagination,
  normalizeResearchCohort,
  normalizeResearchPagination,
  researchPercent,
  shouldSuppressResearchBinary,
  shouldSuppressResearchCell,
} from "./research"

describe("research contracts", () => {
  it("normalizes an empty cohort to complete cases", () => {
    expect(normalizeResearchCohort()).toEqual({
      version: 1,
      filters: expect.objectContaining({ statuses: ["COMPLETE"] }),
    })
  })

  it("trims and deduplicates controlled filter values", () => {
    const result = normalizeResearchCohort({
      filters: {
        statuses: ["COMPLETE"],
        diagnosisCodes: [" C61 ", "C61", ""],
        diagnosisText: " prostate ",
        ageYears: { min: 90, max: 20 },
        minimumCompleteness: 140,
      },
    })

    expect(result.filters.diagnosisCodes).toEqual(["C61"])
    expect(result.filters.diagnosisText).toBe("prostate")
    expect(result.filters.ageYears).toEqual({ min: 20, max: 90 })
    expect(result.filters.minimumCompleteness).toBe(100)
  })

  it("enforces safe pagination bounds", () => {
    expect(normalizeResearchPagination()).toEqual({ skip: 0, take: RESEARCH_DEFAULT_PAGE_SIZE })
    expect(normalizeResearchPagination({ skip: -4, take: 1000 })).toEqual({
      skip: 0,
      take: RESEARCH_MAX_PAGE_SIZE,
    })
    expect(makeResearchPagination(75, { skip: 50, take: 25 })).toEqual({
      total: 75,
      skip: 50,
      take: 25,
      hasMore: false,
    })
  })

  it("suppresses only non-zero small cells", () => {
    expect(shouldSuppressResearchCell(0)).toBe(false)
    expect(shouldSuppressResearchCell(1)).toBe(true)
    expect(shouldSuppressResearchCell(4)).toBe(true)
    expect(shouldSuppressResearchCell(5)).toBe(false)
  })

  it("protects binary cells using the valid denominator and complement", () => {
    expect(shouldSuppressResearchBinary(0, 0)).toBe(false)
    expect(shouldSuppressResearchBinary(1, 20)).toBe(true)
    expect(shouldSuppressResearchBinary(4, 20)).toBe(true)
    expect(shouldSuppressResearchBinary(5, 20)).toBe(false)
    expect(shouldSuppressResearchBinary(16, 20)).toBe(true)
    expect(shouldSuppressResearchBinary(15, 20)).toBe(false)
  })

  it("returns exact or protected cohort counts deterministically", () => {
    expect(discloseResearchCount(0)).toEqual({
      value: 0,
      lowerBound: 0,
      upperBound: 0,
      exact: true,
      suppressed: false,
    })
    expect(discloseResearchCount(4)).toMatchObject({
      value: null,
      lowerBound: 1,
      upperBound: 4,
      exact: false,
      suppressed: true,
    })
    expect(discloseResearchCount(5)).toMatchObject({ lowerBound: 5, upperBound: 9 })
    expect(discloseResearchCount(17)).toMatchObject({ lowerBound: 10, upperBound: 19 })
    expect(discloseResearchCount(126)).toMatchObject({ lowerBound: 100, upperBound: 149 })
    expect(discloseResearchCount(4, true)).toMatchObject({
      value: 4,
      lowerBound: 4,
      upperBound: 4,
      exact: true,
    })
  })

  it("calculates percentages without invalid denominators", () => {
    expect(researchPercent(1, 4)).toBe(25)
    expect(researchPercent(2, 3)).toBe(66.7)
    expect(researchPercent(1, 0)).toBeNull()
  })

  it("counts only active non-default filters", () => {
    expect(activeResearchFilterCount(normalizeResearchCohort())).toBe(0)
    expect(activeResearchFilterCount(normalizeResearchCohort({
      filters: { statuses: ["COMPLETE"], emergency: true, asa: ["III"] },
    }))).toBe(2)
  })
})

describe("benchmark metrics", () => {
  /**
   * Benchmarking evaluates far fewer metrics than an aggregate query does, and
   * the gap is what these cases pin down. A client that offers the query list in
   * a benchmark picker offers metrics that return nothing for every period,
   * which reads as an institution that recorded nothing rather than as a feature
   * nobody wrote.
   */
  it("names only the metrics benchmarking can evaluate", () => {
    expect([...RESEARCH_BENCHMARK_METRIC_IDS]).toEqual([
      "caseCount",
      "meanAgeYears",
      "meanDurationMinutes",
      "complicationRate",
      "fieldCompleteness",
    ])
  })

  it("stays a strict subset of the metrics a query supports", () => {
    const unknown = RESEARCH_BENCHMARK_METRIC_IDS
      .filter(id => !(RESEARCH_METRIC_IDS as readonly string[]).includes(id))
    expect(unknown).toEqual([])
    expect(RESEARCH_BENCHMARK_METRIC_IDS.length).toBeLessThan(RESEARCH_METRIC_IDS.length)
  })

  it("keeps the full metric list intact for aggregate queries", () => {
    // The other half of the point: the fourteen are not wrong, they are simply
    // not all benchmarkable. Trimming this list would remove working features.
    expect(RESEARCH_METRIC_IDS).toHaveLength(14)
    expect(RESEARCH_METRIC_IDS).toContain("ponvRate")
  })
})
