import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/hospital/ai-boundary", () => ({ clinicalAiCapabilities: vi.fn() }))

import { dayBuckets } from "./appliance-activity"

// The Status overview (1.5.4) charts cases per day: every day is present, oldest first.
describe("cases per day for the Status overview", () => {
  it("lists every one of the last days, ending today, with zero where nothing happened", () => {
    const now = Date.parse("2026-10-10T14:30:00Z")
    const days = dayBuckets(now, new Map([["2026-10-10", 4], ["2026-10-08", 2]]), new Map([["2026-10-10", 3]]), 3)
    expect(days).toEqual([
      { day: "2026-10-08", started: 2, finalized: 0 },
      { day: "2026-10-09", started: 0, finalized: 0 },
      { day: "2026-10-10", started: 4, finalized: 3 },
    ])
  })

  it("covers thirty days by default", () => {
    const days = dayBuckets(Date.parse("2026-03-01T00:10:00Z"), new Map(), new Map())
    expect(days).toHaveLength(30)
    expect(days[29].day).toBe("2026-03-01")
    expect(days[0].day).toBe("2026-01-31")
  })
})
