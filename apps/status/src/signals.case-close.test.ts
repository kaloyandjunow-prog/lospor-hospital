import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCaseCloseSignal, readSignalObservations } from "./signals.js"

const now = Date.parse("2026-09-07T12:00:00.000Z")
const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString()

function signalsDirWith(contents: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "lospor-case-close-"))
  for (const [file, value] of Object.entries(contents)) {
    writeFileSync(join(dir, file), JSON.stringify(value))
  }
  return dir
}

function caseCloseFile(observedAt: string, state = "SUCCESS", resultCode = "CASE_CLOSE_COMPLETED") {
  return { schemaVersion: 1, signalType: "case-close", observedAt, state, resultCode }
}

const observationFor = async (dir: string) =>
  (await readSignalObservations(dir, now)).find(o => o.component === "case-close")

describe("case-close signal", () => {
  it("accepts the shape the worker writes", () => {
    expect(parseCaseCloseSignal(caseCloseFile(minutesAgo(3)), now)).not.toBeNull()
  })

  it("refuses a signal carrying anything extra", () => {
    // The worker writes a fixed set of keys. Anything else means a different
    // producer, and a status page must not render what it cannot vouch for.
    expect(parseCaseCloseSignal({
      ...caseCloseFile(minutesAgo(3)), closedCaseIds: ["case-1"],
    }, now)).toBeNull()
  })

  it("refuses another signal type wearing the case-close filename", () => {
    expect(parseCaseCloseSignal({
      ...caseCloseFile(minutesAgo(3)), signalType: "retention",
    }, now)).toBeNull()
  })

  it("refuses a result code it does not define", () => {
    expect(parseCaseCloseSignal(
      caseCloseFile(minutesAgo(3), "SUCCESS", "CASE_CLOSE_SKIPPED"), now,
    )).toBeNull()
  })
})

describe("automatic case closure observation", () => {
  it("is operational after a recent sweep", async () => {
    const dir = signalsDirWith({ "case-close-status.v1.json": caseCloseFile(minutesAgo(3)) })
    expect(await observationFor(dir)).toMatchObject({
      status: "operational", code: "CASE_CLOSE_COMPLETED",
    })
  })

  /**
   * Aged on its own five-minute cadence rather than the daily one retention
   * uses. The sweep exists to close cases inside a thirty-minute window, so a
   * sweep that last succeeded an hour ago is already failing at its job even
   * though nothing errored.
   */
  it("degrades at twenty minutes and is an outage at an hour", async () => {
    expect(await observationFor(signalsDirWith({
      "case-close-status.v1.json": caseCloseFile(minutesAgo(25)),
    }))).toMatchObject({ status: "degraded", code: "CASE_CLOSE_AGING" })

    expect(await observationFor(signalsDirWith({
      "case-close-status.v1.json": caseCloseFile(minutesAgo(90)),
    }))).toMatchObject({ status: "outage", code: "CASE_CLOSE_OVERDUE" })
  })

  it("surfaces a refusal as an outage carrying the worker's own code", async () => {
    expect(await observationFor(signalsDirWith({
      "case-close-status.v1.json": caseCloseFile(minutesAgo(2), "FAILURE", "CASE_CLOSE_REJECTED"),
    }))).toMatchObject({ status: "outage", code: "CASE_CLOSE_REJECTED" })
  })

  /**
   * The defect this whole component exists for: on an appliance nothing ever
   * called the closure route, and nothing said so. Missing must read as
   * unknown -- never as healthy, which is exactly how its absence read before.
   */
  it("reads as unknown, not healthy, when no sweep has ever run", async () => {
    expect(await observationFor(signalsDirWith({}))).toMatchObject({
      status: "unknown", code: "CASE_CLOSE_SIGNAL_MISSING",
    })
  })
})
