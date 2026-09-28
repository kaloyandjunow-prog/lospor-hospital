// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// Resume on the web chart (9.13.0): the window counts from the saved end on
// the server's clock, and "until" is said in the case's zone -- it used the
// computer's, which on a GMT+1 host was an hour off for a Sofia case.

const clock = vi.hoisted(() => ({ now: Date.parse("2026-09-27T12:10:00.000Z") }))
vi.mock("@/lib/intraop-clock", () => ({ serverNow: () => new Date(clock.now) }))
vi.mock("sonner", () => ({ toast: vi.fn() }))

import { useIntraopResumeWindow } from "./useIntraopResumeWindow"

describe("the web chart's resume window", () => {
  it("reopened ten minutes after the end: twenty minutes left, closing at the case's own time", () => {
    const { result } = renderHook(() => useIntraopResumeWindow("2026-09-27T12:00:00.000Z", "Europe/Sofia"))
    expect(result.current.resumeSecsLeft).toBe(20 * 60)
    expect(result.current.resumeUntilLabel).toBe("15:30")
  })

  it("the same end in another zone closes at that zone's time", () => {
    const { result } = renderHook(() => useIntraopResumeWindow("2026-09-27T12:00:00.000Z", "Etc/GMT-1"))
    expect(result.current.resumeUntilLabel).toBe("13:30")
  })

  it("follows the server's clock, not the computer's", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-09-27T12:00:30.000Z"))
    try {
      clock.now = Date.parse("2026-09-27T12:25:00.000Z")
      const { result } = renderHook(() => useIntraopResumeWindow("2026-09-27T12:00:00.000Z", "Europe/Sofia"))
      expect(result.current.resumeSecsLeft).toBe(5 * 60)
    } finally {
      vi.useRealTimers()
      clock.now = Date.parse("2026-09-27T12:10:00.000Z")
    }
  })

  it("a case reopened after the window offers nothing", () => {
    clock.now = Date.parse("2026-09-27T13:00:00.000Z")
    try {
      const { result } = renderHook(() => useIntraopResumeWindow("2026-09-27T12:00:00.000Z", "Europe/Sofia"))
      expect(result.current.resumeSecsLeft).toBe(0)
      expect(result.current.resumeUntilLabel).toBe("")
    } finally {
      clock.now = Date.parse("2026-09-27T12:10:00.000Z")
    }
  })
})
