import { describe, expect, it } from "vitest"
import { dashboardCaseTarget } from "./dashboard-case-routing"

describe("dashboard case routing", () => {
  it("opens queued intraop work even while the server still has only preop", () => {
    expect(dashboardCaseTarget({ status: "DRAFT" }, true)).toBe("intraop")
  })

  it("keeps the normal server-backed workflow order", () => {
    expect(dashboardCaseTarget({ status: "DRAFT" }, false)).toBe("preop")
    expect(dashboardCaseTarget({ status: "DRAFT", intraop: {} }, false)).toBe("intraop")
    expect(dashboardCaseTarget({ status: "COMPLETE", intraop: {} }, true)).toBe("case")
  })
})
