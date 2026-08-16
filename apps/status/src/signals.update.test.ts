import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { parseUpdateSignal, readSignalObservations } from "./signals.js"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

const now = Date.parse("2026-08-16T12:00:00.000Z")
const observedAt = "2026-08-16T11:55:00.000Z"

function signalsDirWith(signal: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), "lospor-update-signal-"))
  directories.push(directory)
  if (signal !== undefined) {
    writeFileSync(join(directory, "appliance-update.v1.json"), JSON.stringify(signal))
  }
  return directory
}

async function updateObservation(signal: unknown) {
  const observations = await readSignalObservations(signalsDirWith(signal), now)
  const observation = observations.find(entry => entry.component === "appliance-update")
  expect(observation).toBeDefined()
  return observation!
}

describe("parseUpdateSignal", () => {
  it("accepts a well-formed available-update signal", () => {
    const parsed = parseUpdateSignal({
      schemaVersion: 1, signalType: "appliance-update", observedAt,
      state: "update-available", installedVersion: "1.0.0", latestVersion: "1.0.1",
    }, now)
    expect(parsed?.latestVersion).toBe("1.0.1")
  })

  it("refuses an available update that does not name a version", () => {
    // Rendering an alarm nobody can act on is worse than rendering nothing.
    expect(parseUpdateSignal({
      schemaVersion: 1, signalType: "appliance-update", observedAt,
      state: "update-available", installedVersion: "1.0.0",
    }, now)).toBeNull()
  })

  it("refuses signals of the wrong type, schema, shape or version format", () => {
    const valid = {
      schemaVersion: 1, signalType: "appliance-update", observedAt,
      state: "current", installedVersion: "1.0.0", latestVersion: "1.0.0",
    }
    expect(parseUpdateSignal({ ...valid, signalType: "backup" }, now)).toBeNull()
    expect(parseUpdateSignal({ ...valid, schemaVersion: 2 }, now)).toBeNull()
    expect(parseUpdateSignal({ ...valid, state: "fine" }, now)).toBeNull()
    expect(parseUpdateSignal({ ...valid, latestVersion: "v1.0.0" }, now)).toBeNull()
    expect(parseUpdateSignal({ ...valid, installedVersion: "1.0" }, now)).toBeNull()
    expect(parseUpdateSignal({ ...valid, unexpected: true }, now)).toBeNull()
    expect(parseUpdateSignal("not an object", now)).toBeNull()
  })

  it("refuses a signal dated implausibly far in the future", () => {
    expect(parseUpdateSignal({
      schemaVersion: 1, signalType: "appliance-update",
      observedAt: "2026-08-16T13:00:00.000Z",
      state: "current", installedVersion: "1.0.0", latestVersion: "1.0.0",
    }, now)).toBeNull()
  })

  it("allows a not-yet-installed appliance to report a placeholder version", () => {
    expect(parseUpdateSignal({
      schemaVersion: 1, signalType: "appliance-update", observedAt,
      state: "unknown", installedVersion: "-",
    }, now)?.installedVersion).toBe("-")
  })
})

describe("the appliance-release observation", () => {
  it("is unknown, never operational, when no check has ever run", async () => {
    const observation = await updateObservation(undefined)
    expect(observation.status).toBe("unknown")
    expect(observation.code).toBe("UPDATE_CHECK_NEVER_RUN")
  })

  it("is unknown when the last check could not reach the registry", async () => {
    // The failure this whole feature exists to prevent: a site that cannot ask
    // must not appear up to date.
    const observation = await updateObservation({
      schemaVersion: 1, signalType: "appliance-update", observedAt,
      state: "unknown", installedVersion: "1.0.0",
    })
    expect(observation.status).toBe("unknown")
    expect(observation.code).toBe("UPDATE_CHECK_FAILED")
  })

  it("does not turn the appliance amber merely because an update exists", async () => {
    const observation = await updateObservation({
      schemaVersion: 1, signalType: "appliance-update", observedAt,
      state: "update-available", installedVersion: "1.0.0", latestVersion: "1.0.1",
    })
    expect(observation.status).toBe("operational")
    expect(observation.code).toBe("UPDATE_AVAILABLE")
  })

  it("says an update is downloaded once the staged version matches", async () => {
    const observation = await updateObservation({
      schemaVersion: 1, signalType: "appliance-update", observedAt,
      state: "update-available", installedVersion: "1.0.0",
      latestVersion: "1.0.1", fetchedVersion: "1.0.1",
    })
    expect(observation.code).toBe("UPDATE_DOWNLOADED_READY_TO_APPLY")
  })

  it("does not claim readiness when a stale earlier version was staged", async () => {
    const observation = await updateObservation({
      schemaVersion: 1, signalType: "appliance-update", observedAt,
      state: "update-available", installedVersion: "1.0.0",
      latestVersion: "1.0.2", fetchedVersion: "1.0.1",
    })
    expect(observation.code).toBe("UPDATE_AVAILABLE")
  })

  it("degrades when nobody has successfully checked for a fortnight", async () => {
    const observation = await updateObservation({
      schemaVersion: 1, signalType: "appliance-update",
      observedAt: "2026-07-01T00:00:00.000Z",
      state: "current", installedVersion: "1.0.0", latestVersion: "1.0.0",
    })
    expect(observation.status).toBe("degraded")
    expect(observation.code).toBe("UPDATE_CHECK_STALE")
  })

  it("is operational and quiet when the release is current", async () => {
    const observation = await updateObservation({
      schemaVersion: 1, signalType: "appliance-update", observedAt,
      state: "current", installedVersion: "1.0.0", latestVersion: "1.0.0",
    })
    expect(observation.status).toBe("operational")
    expect(observation.code).toBe("RELEASE_CURRENT")
  })
})
