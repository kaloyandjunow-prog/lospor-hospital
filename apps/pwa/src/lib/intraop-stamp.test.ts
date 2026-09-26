import { describe, expect, it } from "vitest"

import { atRow, resolveRowStamp } from "./intraop-stamp"
import { timelineRefusalMessageKey } from "./intraop-timeline-refusal"

const chartStart = new Date("2026-09-26T21:00:00.000Z")

describe("row stamps", () => {
  it("records the row start for an earlier row: a stop tapped at 22:19 in the 21:30 row is 21:30", () => {
    expect(resolveRowStamp("2026-09-26T21:30:00.000Z", chartStart, new Date("2026-09-26T22:19:27.000Z")))
      .toBe("2026-09-26T21:30:00.000Z")
  })

  it("records the exact minute in the now row, and now when there is no row", () => {
    const now = new Date("2026-09-26T21:37:42.000Z")
    expect(resolveRowStamp("2026-09-26T21:35:00.000Z", chartStart, now)).toBe("2026-09-26T21:37:00.000Z")
    expect(resolveRowStamp(null, chartStart, now)).toBe("2026-09-26T21:37:00.000Z")
  })

  it("never carries a stale sheet time: an explicit no-row stamp means now", () => {
    expect(atRow(undefined)).toEqual({ rowTs: null })
  })
})

describe("refusal messages", () => {
  it("names the first refused rule", () => {
    expect(timelineRefusalMessageKey([{ code: "FUTURE_VITAL", eventId: "v" }])).toBe("timelineFutureVital")
    expect(timelineRefusalMessageKey([{ code: "STOP_BEFORE_START", eventId: "s" }])).toBe("timelineStopBeforeStart")
    expect(timelineRefusalMessageKey([])).toBeNull()
  })
})
