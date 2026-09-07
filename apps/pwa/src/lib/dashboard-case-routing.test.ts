import { describe, expect, it } from "vitest"
import { dashboardCaseTarget, preopReadyForAllocation } from "./dashboard-case-routing"

describe("dashboard case routing", () => {
  it("opens queued intraop work even while the server still has only preop", () => {
    expect(dashboardCaseTarget({ status: "DRAFT" }, true)).toBe("intraop")
  })

  it("keeps the normal server-backed workflow order for a writable case", () => {
    expect(dashboardCaseTarget({ status: "DRAFT", capabilities: { canWrite: true } }, false)).toBe("preop")
    expect(dashboardCaseTarget({ status: "DRAFT", intraop: {}, capabilities: { canWrite: true } }, false)).toBe("intraop")
    expect(dashboardCaseTarget({ status: "COMPLETE", intraop: {}, capabilities: { canWrite: true } }, true)).toBe("case")
  })

  it("opens the read-only summary for a case handed to someone else, not an editor", () => {
    expect(dashboardCaseTarget(
      { status: "IN_PROGRESS", intraop: {}, capabilities: { canWrite: false } },
      false,
    )).toBe("case")
    expect(dashboardCaseTarget(
      { status: "DRAFT", capabilities: { canWrite: false } },
      false,
    )).toBe("case")
  })

  it("still lets a device flush its own queued offline intraop work even if capabilities later say read-only", () => {
    expect(dashboardCaseTarget(
      { status: "IN_PROGRESS", capabilities: { canWrite: false } },
      true,
    )).toBe("intraop")
  })

  // This function is only ever called with server-fetched cases -- local
  // drafts route through their own path in the dashboard screen and never
  // reach here -- and the server always attaches `capabilities` to every case
  // it returns. So missing/malformed capabilities on what looks like a
  // server case is itself an anomaly, and must fail closed the same way an
  // explicit `canWrite: false` does, not fail open.
  it("fails closed to the read-only summary when capabilities are missing entirely", () => {
    expect(dashboardCaseTarget({ status: "DRAFT" }, false)).toBe("case")
    expect(dashboardCaseTarget({ status: "DRAFT", intraop: {} }, false)).toBe("case")
    expect(dashboardCaseTarget({ status: "DRAFT", capabilities: null }, false)).toBe("case")
  })
})

describe("preopReadyForAllocation", () => {
  const base = { plannedProcedure: "Appendectomy", asaScore: "II", sex: "MALE" }

  it("is ready once age is recorded in whole years", () => {
    expect(preopReadyForAllocation({ ...base, ageYears: 34 })).toBe(true)
  })

  it("is ready for a neonate/infant recorded as a precise value+unit, with no ageYears at all", () => {
    expect(preopReadyForAllocation({ ...base, ageValue: 12, ageUnit: "DAYS" })).toBe(true)
    expect(preopReadyForAllocation({ ...base, ageValue: 6, ageUnit: "MONTHS" })).toBe(true)
  })

  it("is not ready when no age has been recorded either way", () => {
    expect(preopReadyForAllocation({ ...base })).toBe(false)
    expect(preopReadyForAllocation({ ...base, ageValue: 12 })).toBe(false) // unit missing
  })

  it("is not ready when another required field is missing", () => {
    expect(preopReadyForAllocation({ asaScore: "II", sex: "MALE", ageYears: 34 })).toBe(false)
  })

  it("is not ready when preop is entirely absent", () => {
    expect(preopReadyForAllocation(undefined)).toBe(false)
  })
})
