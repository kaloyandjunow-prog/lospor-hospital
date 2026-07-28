import { describe, it, expect } from "vitest"
import { elapsedSecsSinceStart, resolveStartAnchor } from "@/lib/intraop-clock"

/** Local wall-clock Date for "today at HH:MM:SS". */
const at = (h: number, m: number, s = 0) => {
  const d = new Date()
  d.setHours(h, m, s, 0)
  return d
}
const HOUR = 3600

describe("elapsedSecsSinceStart", () => {
  it("counts forward from a start time earlier today", () => {
    expect(elapsedSecsSinceStart("08:00", at(9, 30))).toBe(1.5 * HOUR)
  })

  it("is zero at the moment the case starts", () => {
    expect(elapsedSecsSinceStart("08:00", at(8, 0))).toBe(0)
  })

  it("floors the start to the 5-minute grid, matching the columns", () => {
    // 08:07 floors to 08:05, so 08:35 is 30 minutes in, not 28.
    expect(elapsedSecsSinceStart("08:07", at(8, 35))).toBe(30 * 60)
  })

  // The reported bug: at 15:10, a start of 16:20 was read as "started
  // yesterday", i.e. ~22.8 h elapsed. That marched the now-marker forward and
  // grew the table by an hour every 10 s tick.
  it("treats a start time later today as not started yet", () => {
    expect(elapsedSecsSinceStart("16:20", at(15, 10))).toBeNull()
  })

  it("treats a start a few minutes ahead as not started yet", () => {
    expect(elapsedSecsSinceStart("15:15", at(15, 10))).toBeNull()
  })

  it("still handles a real case that crossed midnight", () => {
    // Started 23:50, it is now 00:30 — 40 minutes in.
    expect(elapsedSecsSinceStart("23:50", at(0, 30))).toBe(40 * 60)
  })

  it("handles a long overnight case up to the 12h cutoff", () => {
    // Started 20:00 yesterday, now 07:00 — 11 hours in, still recognised.
    expect(elapsedSecsSinceStart("20:00", at(7, 0))).toBe(11 * HOUR)
  })

  it("rejects the wrap once it implies an implausibly long case", () => {
    // Started 09:00, now 08:00. Wrapping would imply 23 h elapsed — far more
    // likely a start typed an hour into the future.
    expect(elapsedSecsSinceStart("09:00", at(8, 0))).toBeNull()
  })

  it("defaults to 08:00 when no start time is set", () => {
    expect(elapsedSecsSinceStart(undefined, at(9, 0))).toBe(1 * HOUR)
  })
})

describe("resolveStartAnchor", () => {
  it("anchors column 0 to today's start time", () => {
    expect(resolveStartAnchor("08:00", at(9, 0))).toBe(at(8, 0).getTime())
  })

  it("anchors to yesterday for a genuine midnight crossing", () => {
    const anchor = resolveStartAnchor("23:50", at(0, 30))
    expect(anchor).toBe(at(23, 50).getTime() - 24 * 3600_000)
  })

  it("returns null for a future start, so no timestamp is invented", () => {
    expect(resolveStartAnchor("16:20", at(15, 10))).toBeNull()
  })

  it("agrees with elapsedSecsSinceStart on the started/not-started call", () => {
    for (const [start, now] of [
      ["08:00", at(9, 0)], ["16:20", at(15, 10)], ["23:50", at(0, 30)],
    ] as const) {
      expect(resolveStartAnchor(start, now) === null)
        .toBe(elapsedSecsSinceStart(start, now) === null)
    }
  })
})
