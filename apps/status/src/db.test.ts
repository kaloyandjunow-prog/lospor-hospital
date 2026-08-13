import { afterEach, describe, expect, it } from "vitest"
import { StatusDatabase } from "./db.js"
import type { CheckObservation } from "./types.js"

const databases: StatusDatabase[] = []
afterEach(() => {
  while (databases.length) databases.pop()?.close()
})

function setup() {
  const db = new StatusDatabase(":memory:")
  databases.push(db)
  return db
}

function observation(status: CheckObservation["status"], checkedAt: number): CheckObservation {
  return {
    component: "api",
    label: "Clinical API",
    group: "clinical",
    status,
    code: status === "operational" ? "API_READY" : "API_NOT_LIVE",
    checkedAt,
  }
}

describe("availability history and incidents", () => {
  it("opens after three failures and recovers after two successes", () => {
    const db = setup()
    db.recordObservation(observation("operational", 1_000))
    db.recordObservation(observation("outage", 2_000))
    db.recordObservation(observation("outage", 3_000))
    expect(db.getDashboard(3_000).components[0]?.status).toBe("operational")
    db.recordObservation(observation("outage", 4_000))
    let dashboard = db.getDashboard(4_000)
    expect(dashboard.components[0]?.status).toBe("outage")
    expect(dashboard.incidents).toHaveLength(1)
    expect(dashboard.incidents[0]?.resolvedAt).toBeNull()
    db.recordObservation(observation("operational", 5_000))
    expect(db.getDashboard(5_000).components[0]?.status).toBe("outage")
    db.recordObservation(observation("operational", 6_000))
    dashboard = db.getDashboard(6_000)
    expect(dashboard.components[0]?.status).toBe("operational")
    expect(dashboard.incidents[0]?.resolvedAt).toBe(6_000)
  })

  it("stores events idempotently", () => {
    const db = setup()
    const event = {
      id: "8cb77871-2875-4332-94e1-728bb7b3871b",
      producer: "api",
      occurredAt: 1_000,
      code: "AUDIT_WRITE_FAILED",
      severity: "critical",
      message: "Clinical audit recording failed",
      facts: {},
    }
    expect(db.insertEvent(event)).toBe(true)
    expect(db.insertEvent(event)).toBe(false)
    expect(db.getDashboard(1_000).events).toHaveLength(1)
  })

  it("keeps the stored event authoritative when an ID is replayed", () => {
    const db = setup()
    const id = "8cb77871-2875-4332-94e1-728bb7b3871b"
    db.sqlite.prepare(`
      INSERT INTO operational_events(id, producer, occurred_at, code, severity, message, facts_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, "api", 1_000, "AUDIT_WRITE_FAILED", "critical", "Original fixed message", "{}")
    expect(db.insertEvent({
      id,
      producer: "api",
      occurredAt: 2_000,
      code: "EMAIL_DELIVERY_FAILED",
      severity: "warning",
      message: "Replayed fixed message",
      facts: {},
    })).toBe(false)
    expect(db.getDashboard(2_000).events).toEqual([expect.objectContaining({
      id,
      occurredAt: 1_000,
      code: "AUDIT_WRITE_FAILED",
      message: "Original fixed message",
    })])
  })

  it("retains authentication security events for 90 days", () => {
    const db = setup()
    const now = Date.parse("2026-08-12T12:00:00.000Z")
    const event = (id: string, producer: string, ageDays: number) => ({
      id,
      producer,
      occurredAt: now - ageDays * 86_400_000,
      code: "STATUS_LOGIN_FAILED",
      severity: "warning",
      message: "A Status sign-in attempt failed",
      facts: {},
    })
    db.insertEvent(event("8cb77871-2875-4332-94e1-728bb7b3871b", "api", 31))
    db.insertEvent(event("8cb77871-2875-4332-94e1-728bb7b3871c", "status-auth", 31))
    db.insertEvent(event("8cb77871-2875-4332-94e1-728bb7b3871d", "status-auth", 91))
    db.retain(now)
    const rows = db.sqlite.prepare(
      "SELECT id FROM operational_events ORDER BY id",
    ).all() as Array<{ id: string }>
    expect(rows).toEqual([{ id: "8cb77871-2875-4332-94e1-728bb7b3871c" }])
    expect(db.getDashboard(now).events.map(item => item.id)).toEqual([
      "8cb77871-2875-4332-94e1-728bb7b3871c",
    ])
  })

  it("buckets 15-second observations into five-minute worst-state samples", () => {
    const db = setup()
    const start = Date.parse("2026-08-12T12:00:00.000Z")
    for (let offset = 0; offset < 60 * 60_000; offset += 15_000) {
      const status = offset === 14 * 60_000 ? "outage" : "operational"
      db.recordObservation(observation(status, start + offset))
    }
    const rows = db.sqlite.prepare(`
      SELECT checked_at, status FROM availability_samples ORDER BY checked_at
    `).all() as Array<{ checked_at: number; status: string }>
    expect(rows).toHaveLength(12)
    expect(rows.find(row => row.checked_at === start + 10 * 60_000)?.status).toBe("outage")
    // 12 components × 288 buckets/day × 30 days remains below the 250k hard cap.
    expect(12 * 288 * 30).toBeLessThan(250_000)
  })

  it("never downgrades an existing daily worst-state summary", () => {
    const db = setup()
    const day = Date.parse("2026-01-01T12:00:00.000Z")
    db.recordObservation(observation("outage", day))
    db.retain(Date.parse("2026-02-01T12:00:00.000Z"))
    db.recordObservation(observation("operational", day + 5 * 60_000))
    db.retain(Date.parse("2026-02-02T12:00:00.000Z"))
    expect(db.sqlite.prepare(`
      SELECT status FROM availability_daily WHERE component = 'api' AND day = '2026-01-01'
    `).get()).toEqual({ status: "outage" })
  })

  it("keeps live state available and warns when history writes fail", () => {
    const db = setup()
    db.sqlite.exec("DROP TABLE availability_samples")
    expect(() => db.recordObservation(observation("operational", 10_000))).not.toThrow()
    const dashboard = db.getDashboard(10_000)
    expect(dashboard.components.find(item => item.component === "api")?.status).toBe("operational")
    expect(dashboard.components.find(item => item.component === "status-history")).toMatchObject({
      status: "degraded",
      code: "STATUS_HISTORY_UNAVAILABLE",
    })
  })
})
