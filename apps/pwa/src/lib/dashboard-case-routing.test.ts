import { describe, expect, it } from "vitest"
import { dashboardCaseTarget, dashboardTabCounts, type DashboardCountableCase } from "./dashboard-case-routing"

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

describe("dashboardTabCounts", () => {
  const isToday = () => false
  const isThisMonth = () => false
  const countsFor = (cases: DashboardCountableCase[]) =>
    dashboardTabCounts(null, cases, 0, isToday, isThisMonth)

  /**
   * The offline fallback has to agree with the two things it stands between:
   * the server's own count, which asks for `intraop.endTime != null`, and the
   * screen's list filter directly under the tab. It asked instead whether an
   * intraop record existed at all, so a case still in theatre was counted here
   * and absent from the list -- the tab read a number larger than the list it
   * labelled, with nothing to explain the difference.
   */
  it("counts awaiting-postop by a finished intraop, not by one existing", () => {
    const cases: DashboardCountableCase[] = [
      { createdAt: "2026-09-07T08:00:00.000Z", status: "IN_PROGRESS", intraop: { endTime: null } },
      { createdAt: "2026-09-07T08:00:00.000Z", status: "IN_PROGRESS", intraop: { endTime: "2026-09-07T09:30:00.000Z" } },
      { createdAt: "2026-09-07T08:00:00.000Z", status: "COMPLETE", intraop: { endTime: "2026-09-07T09:30:00.000Z" } },
    ]

    expect(countsFor(cases)["Awaiting Postop"]).toBe(1)
  })

  it("prefers the server's counts whenever it has them", () => {
    const server = {
      all: 90, today: 4, month: 20, active: 7, drafts: 2, awaitingPostop: 3, complete: 83,
    }
    expect(dashboardTabCounts(server, [], 0, isToday, isThisMonth)["Awaiting Postop"]).toBe(3)
  })
})
