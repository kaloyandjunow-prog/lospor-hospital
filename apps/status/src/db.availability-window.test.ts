import { describe, expect, it } from "vitest"
import { StatusDatabase } from "./db.js"

// The overview's 24-hour and 7-day views (1.5.4) read the 5-minute samples.
describe("availability in recent slots", () => {
  const now = Date.parse("2026-10-10T12:00:00Z")
  const observe = (db: StatusDatabase, minutesAgo: number, status: "operational" | "degraded" | "outage") =>
    db.recordObservation({ component: "web", label: "Clinical web", group: "clinical", status, code: "WEB_OK", checkedAt: now - minutesAgo * 60_000 })

  it("keeps the worst status in each slot and marks slots without samples unknown", () => {
    const db = new StatusDatabase(":memory:")
    observe(db, 50, "operational")
    observe(db, 40, "outage")
    observe(db, 35, "operational")
    observe(db, 10, "degraded")
    const row = db.availabilityWindow(["web"], now, 60 * 60_000, 15 * 60_000).web
    expect(row).toEqual(["operational", "outage", "unknown", "degraded"])
  })

  it("returns a full row for a component that has never been seen", () => {
    const db = new StatusDatabase(":memory:")
    expect(db.availabilityWindow(["central"], now, 24 * 3_600_000, 15 * 60_000).central).toHaveLength(96)
  })
})
