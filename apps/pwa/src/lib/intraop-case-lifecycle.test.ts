import { describe, expect, it } from "vitest"
import { buildFinaliseCaseState, buildResumeCaseState, CASE_RESUME_WINDOW_SECONDS } from "./intraop-case-lifecycle"

describe("buildFinaliseCaseState", () => {
  it("builds end-case state with local end time and continued items", () => {
    const endedAt = new Date(2026, 6, 1, 9, 5)
    expect(buildFinaliseCaseState(["Propofol"], endedAt)).toEqual({
      continuedItems: ["Propofol"],
      endTime: "09:05",
      endedAt,
      resumeSecsLeft: CASE_RESUME_WINDOW_SECONDS,
    })
  })

  it("uses null continued items when none are selected", () => {
    expect(buildFinaliseCaseState([], new Date(2026, 6, 1, 9, 5)).continuedItems).toBeNull()
  })
})

describe("buildResumeCaseState", () => {
  it("builds reset state and the endTime null patch", () => {
    expect(buildResumeCaseState()).toEqual({
      endTime: "",
      endedAt: null,
      resumeSecsLeft: 0,
      patch: { endTime: null, endedAt: null },
    })
  })
})
