import { beforeEach, describe, expect, it } from "vitest"
import {
  clearTimings,
  formatRenderPhases,
  recentTimings,
  recordRenderPhases,
  recordTiming,
  takeRenderPhases,
  timingSummary,
} from "./diagnostics"

// The instrumentation itself.
//
// This module is what the 8.5.0 performance work was decided on: it is how
// "intraop tab switching takes ~1,500 ms" stopped being a feeling and became a
// number, and how that number was split into blocked-vs-render and then into the
// six phases that identified the fourteen sheets.
//
// It had no tests. Instrumentation that lies is worse than none, because it
// sends you confidently in the wrong direction — so the ring buffer, the
// ordering, the take-and-clear, and the summary arithmetic are pinned here.

beforeEach(() => {
  clearTimings()
  takeRenderPhases() // drain any phase state a previous test left behind
})

describe("timing samples", () => {
  it("keeps the newest sample first", () => {
    recordTiming("tab:vitals", 10)
    recordTiming("tab:drugs", 20)

    const samples = recentTimings()
    expect(samples[0]?.label).toBe("tab:drugs")
    expect(samples[1]?.label).toBe("tab:vitals")
  })

  it("caps at twenty samples, discarding the oldest", () => {
    for (let i = 0; i < 25; i++) recordTiming(`tab:${i}`, i)

    const samples = recentTimings()
    expect(samples).toHaveLength(20)
    // Newest kept...
    expect(samples[0]?.label).toBe("tab:24")
    // ...oldest dropped, rather than the buffer growing without bound on a
    // screen that records one sample per tab switch for a whole theatre list.
    expect(samples.map(s => s.label)).not.toContain("tab:0")
  })

  it("keeps the note, which is what makes a duration interpretable", () => {
    recordTiming("tab:drugs", 900, "blocked 40 · render 860")
    expect(recentTimings()[0]?.note).toBe("blocked 40 · render 860")
  })

  it("omits the note entirely when there is none", () => {
    recordTiming("tab:drugs", 12)
    expect(recentTimings()[0]).not.toHaveProperty("note")
  })
})

describe("timingSummary", () => {
  it("reports zeroes rather than NaN when nothing has been recorded", () => {
    // The diagnostics screen renders this before any tab switch has happened.
    expect(timingSummary()).toEqual({ count: 0, worst: 0, median: 0 })
  })

  it("reports the worst and the median, not the most recent", () => {
    for (const ms of [100, 1500, 120, 90, 110]) recordTiming("tab:x", ms)

    const summary = timingSummary()
    expect(summary.count).toBe(5)
    // The 1,500 ms outlier is the whole point — an average would hide it.
    expect(summary.worst).toBe(1500)
    expect(summary.median).toBe(110)
  })

  it("does not let sample order change the answer", () => {
    for (const ms of [1500, 90, 110, 100, 120]) recordTiming("tab:x", ms)
    expect(timingSummary()).toEqual({ count: 5, worst: 1500, median: 110 })
  })
})

describe("render phases", () => {
  it("merges partial updates, since each phase reports separately", () => {
    recordRenderPhases({ buildTab: 5 })
    recordRenderPhases({ buildSheets: 800 })
    recordRenderPhases({ tabTree: 30 })

    expect(takeRenderPhases()).toEqual({ buildTab: 5, buildSheets: 800, tabTree: 30 })
  })

  it("clears on read, so one tab switch never inherits the previous one's numbers", () => {
    recordRenderPhases({ buildSheets: 800 })
    expect(takeRenderPhases()).toEqual({ buildSheets: 800 })
    expect(takeRenderPhases()).toEqual({})
  })

  it("formats missing phases as ? instead of NaN or 0", () => {
    // A phase that did not run is not a phase that took no time; printing 0
    // would have made the sheets look free.
    recordRenderPhases({ buildTab: 4.6, buildSheets: 812.4 })
    const text = formatRenderPhases(takeRenderPhases())

    expect(text).toContain("build 5+812")
    expect(text).toContain("walk ?+?")
    expect(text).toContain("tree tab ? sheets ?")
  })
})
