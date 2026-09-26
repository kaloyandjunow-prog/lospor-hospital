import { describe, expect, it } from "vitest"
import { buildFinaliseCaseState, buildReopenedEndedState, buildResumeCaseState, CASE_RESUME_WINDOW_SECONDS } from "./intraop-case-lifecycle"

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

// 9.12.1: an ended case reopened on the phone looked still running, offered
// End case again (which moved the saved end to now) and never offered Resume.
describe("buildReopenedEndedState", () => {
  const endedAt = new Date("2026-09-26T12:00:00.000Z")

  it("leaves what is left of the resume window after the saved end", () => {
    expect(buildReopenedEndedState(endedAt, false, endedAt.getTime() + 10 * 60_000))
      .toEqual({ resumeSecsLeft: 20 * 60, resumeUnlimited: false })
  })

  it("offers no Resume once the window has passed", () => {
    expect(buildReopenedEndedState(endedAt, false, endedAt.getTime() + 45 * 60_000))
      .toEqual({ resumeSecsLeft: 0, resumeUnlimited: false })
  })

  it("always offers Resume for a case ended automatically after 48 hours", () => {
    expect(buildReopenedEndedState(endedAt, true, endedAt.getTime() + 3 * 24 * 60 * 60_000))
      .toEqual({ resumeSecsLeft: 0, resumeUnlimited: true })
  })
})
