import { describe, expect, it } from "vitest"
import { formatResearchScope } from "./research-scope"

describe("formatResearchScope", () => {
  it("summarizes global access instead of rendering every institution", () => {
    expect(formatResearchScope({
      kind: "ALL",
      institutionIds: ["1", "2", "3"],
      institutionLabels: ["Hospital A", "Hospital B", "Hospital C"],
    }, "All institutions")).toBe("All institutions (3)")
  })

  it("keeps small scopes readable and truncates larger grant scopes", () => {
    expect(formatResearchScope({
      kind: "INSTITUTION",
      institutionIds: ["1"],
      institutionLabels: ["Hospital A"],
    }, "All institutions")).toBe("Hospital A")

    expect(formatResearchScope({
      kind: "GRANT",
      institutionIds: ["1", "2", "3"],
      institutionLabels: ["Hospital A", "Hospital B", "Hospital C"],
    }, "All institutions")).toBe("Hospital A +2")
  })
})
