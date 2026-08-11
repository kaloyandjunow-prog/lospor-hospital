import { describe, expect, it } from "vitest"
import { columnForWallClock } from "./timetable"

/**
 * An anaesthetist records a rate change that happened a few minutes ago — the
 * pump was turned down at 14:20, entered at 14:35 — and it has to land against
 * the time it happened. Putting it in the wrong column moves a drug change on
 * the anaesthetic record.
 */
describe("columnForWallClock", () => {
  const base = { caseStart: "08:00", intervalMinutes: 5, columnCount: 288 }

  it("puts the case start in the first column", () => {
    expect(columnForWallClock({ ...base, time: "08:00" })).toBe(0)
  })

  it("counts five-minute columns from the start", () => {
    expect(columnForWallClock({ ...base, time: "08:05" })).toBe(1)
    expect(columnForWallClock({ ...base, time: "09:00" })).toBe(12)
    expect(columnForWallClock({ ...base, time: "14:20" })).toBe(76)
  })

  it("keeps a time inside the column it falls in, not the next one", () => {
    // 08:09 is still within the 08:05 column.
    expect(columnForWallClock({ ...base, time: "08:09" })).toBe(1)
  })

  it("wraps forward over midnight instead of going negative", () => {
    // A case starting at 23:00 with a change at 00:30 is ninety minutes in.
    // Subtracting plainly would give -1350 minutes and land before the case began.
    expect(columnForWallClock({ ...base, caseStart: "23:00", time: "00:30" })).toBe(18)
  })

  it("clamps to the last column rather than indexing past the chart", () => {
    expect(columnForWallClock({ ...base, time: "07:55", columnCount: 12 })).toBe(11)
  })

  it("rounds the case start down to the chart's grid", () => {
    // A case recorded as starting 08:03 still begins on the 08:00 column, so a
    // change at 08:05 is one column in, not zero.
    expect(columnForWallClock({ ...base, caseStart: "08:03", time: "08:05" })).toBe(1)
  })

  it("falls back to a sane start when none was recorded", () => {
    expect(columnForWallClock({ ...base, caseStart: "", time: "08:05" })).toBe(1)
  })
})
