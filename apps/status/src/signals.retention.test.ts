import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseRetentionSignal, readSignalObservations } from "./signals.js"

const now = Date.parse("2026-08-18T12:00:00.000Z")

function signalsDirWith(contents: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "lospor-retention-"))
  for (const [file, value] of Object.entries(contents)) {
    writeFileSync(join(dir, file), JSON.stringify(value))
  }
  return dir
}

function retentionFile(observedAt: string, state = "SUCCESS", resultCode = "RETENTION_COMPLETED") {
  return { schemaVersion: 1, signalType: "retention", observedAt, state, resultCode }
}

describe("retention signal", () => {
  it("accepts the shape the worker writes", () => {
    expect(parseRetentionSignal(
      retentionFile("2026-08-18T11:00:00.000Z"), now,
    )).not.toBeNull()
  })

  it("refuses a signal carrying anything extra", () => {
    // The worker writes a fixed set of keys. Anything else means a different
    // producer, and a status page must not render what it cannot vouch for.
    expect(parseRetentionSignal({
      ...retentionFile("2026-08-18T11:00:00.000Z"),
      anonymisedUserIds: ["someone"],
    }, now)).toBeNull()
  })

  it("refuses another signal type wearing the retention filename", () => {
    expect(parseRetentionSignal({
      ...retentionFile("2026-08-18T11:00:00.000Z"), signalType: "backup",
    }, now)).toBeNull()
  })

  it("refuses a result code it does not define", () => {
    expect(parseRetentionSignal(
      retentionFile("2026-08-18T11:00:00.000Z", "SUCCESS", "RETENTION_SKIPPED"), now,
    )).toBeNull()
    expect(parseRetentionSignal(
      retentionFile("2026-08-18T11:00:00.000Z", "FAILURE", "RETENTION_COMPLETED"), now,
    )).toBeNull()
  })

  it("refuses a signal dated in the future beyond clock skew", () => {
    expect(parseRetentionSignal(
      retentionFile("2026-08-18T12:05:00.001Z"), now,
    )).toBeNull()
  })
})

describe("retention observation", () => {
  async function retentionObservation(contents: Record<string, unknown>) {
    const observations = await readSignalObservations(signalsDirWith(contents), now)
    return observations.find(o => o.component === "retention")
  }

  it("reports unknown when no purge has ever been recorded", async () => {
    // This is the state every appliance shipped in: the job had no scheduler at
    // all. It must not read as operational.
    const observation = await retentionObservation({})
    expect(observation?.status).toBe("unknown")
    expect(observation?.code).toBe("RETENTION_SIGNAL_MISSING")
  })

  it("reports operational after a recent successful purge", async () => {
    const observation = await retentionObservation({
      "retention-status.v1.json": retentionFile("2026-08-18T11:00:00.000Z"),
    })
    expect(observation?.status).toBe("operational")
    expect(observation?.code).toBe("RETENTION_COMPLETED")
  })

  it("degrades before it fails as the purge ages", async () => {
    const aging = await retentionObservation({
      "retention-status.v1.json": retentionFile("2026-08-16T23:00:00.000Z"), // 37h
    })
    expect(aging?.status).toBe("degraded")
    expect(aging?.code).toBe("RETENTION_AGING")

    const overdue = await retentionObservation({
      "retention-status.v1.json": retentionFile("2026-08-16T11:00:00.000Z"), // 49h
    })
    expect(overdue?.status).toBe("outage")
    expect(overdue?.code).toBe("RETENTION_OVERDUE")
  })

  it("surfaces a failing purge as an outage carrying its reason", async () => {
    const observation = await retentionObservation({
      "retention-status.v1.json": retentionFile(
        "2026-08-18T11:00:00.000Z", "FAILURE", "RETENTION_REJECTED",
      ),
    })
    expect(observation?.status).toBe("outage")
    expect(observation?.code).toBe("RETENTION_REJECTED")
  })

  it("is grouped with the other safety obligations", async () => {
    const observation = await retentionObservation({
      "retention-status.v1.json": retentionFile("2026-08-18T11:00:00.000Z"),
    })
    expect(observation?.group).toBe("safety")
  })
})
