import { describe, expect, it } from "vitest"
import { hostOsObservation, parseHostOsSignal, type HostOsSignal } from "./host-os.js"

const NOW = Date.parse("2026-09-13T09:00:00Z")
const base = {
  schemaVersion: 1, signalType: "host-os", observedAt: "2026-09-13T08:59:30Z",
  release: "24.04", standardSupportEnds: "2029-04-30", securityUpdates: 0, otherUpdates: 4, dockerUpdates: false,
  updatesCheckedAt: "2026-09-13T06:00:00Z", automaticUpdates: "enabled", lastAutomaticRunAt: "2026-09-13T06:10:00Z",
  lastAutomaticResult: "success", rebootRequired: false, rebootRequiredSince: null, bootedAt: "2026-09-01T10:00:00Z",
  rebootPolicy: "manual",
}
const signal = (extra: Record<string, unknown> = {}) => parseHostOsSignal({ ...base, ...extra }, NOW) as HostOsSignal

describe("the Ubuntu signal", () => {
  it("accepts counts, fixed words and times", () => {
    expect(signal()).toMatchObject({ release: "24.04", securityUpdates: 0, automaticUpdates: "enabled" })
    expect(signal({ lastOperation: { action: "security-update", result: "passed", at: "2026-09-13T07:00:00Z" } }).lastOperation)
      .toEqual({ action: "security-update", result: "passed", at: "2026-09-13T07:00:00Z" })
  })

  it("rejects anything that could carry a package name, a path or free text", () => {
    for (const extra of [
      { packages: ["openssl"] },
      { release: "24.04 LTS (Noble Numbat)" },
      { automaticUpdates: "yes" },
      { securityUpdates: -1 },
      { securityUpdates: "3" },
      { lastOperation: { action: "security-update", result: "passed", at: "2026-09-13T07:00:00Z", log: "/var/log/x" } },
      { observedAt: "2026-09-13T10:00:00Z" },
    ]) {
      expect(parseHostOsSignal({ ...base, ...extra }, NOW)).toBeNull()
    }
  })
})

describe("the Ubuntu row", () => {
  const code = (extra: Record<string, unknown>) => hostOsObservation(signal(extra), NOW).code

  it("is current when updates are automatic, recent, and no restart is waiting", () => {
    expect(hostOsObservation(signal(), NOW)).toMatchObject({ status: "operational", code: "HOST_OS_CURRENT" })
  })

  it("reports the worst fact first", () => {
    expect(code({ standardSupportEnds: "2026-04-30", automaticUpdates: "disabled" })).toBe("HOST_OS_UNSUPPORTED")
    expect(code({ automaticUpdates: "not-installed", rebootRequired: true })).toBe("HOST_OS_AUTOMATIC_UPDATES_OFF")
    expect(code({ lastAutomaticResult: "failed" })).toBe("HOST_OS_AUTOMATIC_UPDATES_FAILED")
    expect(code({ securityUpdates: 5, lastAutomaticRunAt: "2026-09-10T06:10:00Z" })).toBe("HOST_OS_SECURITY_UPDATES_PENDING")
    expect(code({ standardSupportEnds: "2027-01-31" })).toBe("HOST_OS_SUPPORT_ENDING")
  })

  it("does not blame fixes the nightly run will install anyway", () => {
    expect(code({ securityUpdates: 5 })).toBe("HOST_OS_CURRENT")
  })

  it("waits for the window when the site chose restarts there, but not forever", () => {
    expect(code({ rebootRequired: true, rebootRequiredSince: "2026-09-12T20:00:00Z" })).toBe("HOST_OS_REBOOT_REQUIRED")
    expect(code({ rebootRequired: true, rebootRequiredSince: "2026-09-12T20:00:00Z", rebootPolicy: "window" })).toBe("HOST_OS_REBOOT_SCHEDULED")
    expect(code({ rebootRequired: true, rebootRequiredSince: "2026-09-09T20:00:00Z", rebootPolicy: "window" })).toBe("HOST_OS_REBOOT_REQUIRED")
  })

  it("is unknown when the signal is missing or stale", () => {
    expect(hostOsObservation(null, NOW).code).toBe("HOST_OS_MISSING")
    expect(hostOsObservation(signal(), NOW + 10 * 60_000).code).toBe("HOST_OS_STALE")
  })
})
