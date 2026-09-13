import { describe, expect, it } from "vitest"
import {
  hostObservabilityObservations,
  parseHostObservabilitySignal,
} from "./signals.js"
import { CODE_MESSAGE, CODE_MESSAGE_BG } from "./ui.js"

const NOW = Date.parse("2026-08-22T12:00:00Z")

const signal = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  signalType: "host-observability",
  observedAt: "2026-08-22T11:59:00Z",
  storage: "ok",
  clock: "synchronized",
  backup: "fresh",
  offHostBackup: "acknowledged",
  keyEscrow: "acknowledged",
  updateAgent: "healthy",
  certificate: "valid",
  services: "healthy",
  restoreLock: "clear",
  activationLock: "clear",
  updateSupply: "connected",
  ...over,
})

describe("host-observability privacy boundary", () => {
  it("accepts only the fixed v2 enum snapshot", () => {
    expect(parseHostObservabilitySignal(signal(), NOW)).toEqual({
      observedAt: "2026-08-22T11:59:00Z",
      storage: "ok",
      clock: "synchronized",
      backup: "fresh",
      offHostBackup: "acknowledged",
      keyEscrow: "acknowledged",
      updateAgent: "healthy",
      certificate: "valid",
      services: "healthy",
      restoreLock: "clear",
      activationLock: "clear",
      updateSupply: "connected",
    })
  })

  it.each([
    { path: "/var/lib/docker" },
    { hostname: "clinical.example.invalid" },
    { address: "10.0.0.7" },
    { detail: "free text" },
    { patientId: "patient-1" },
    { credential: "secret" },
  ])("refuses any extra field, including $path$hostname$address$detail$patientId$credential", extra => {
    expect(parseHostObservabilitySignal(signal(extra), NOW)).toBeNull()
  })

  it("refuses unknown enums, wrong versions and future observations", () => {
    expect(parseHostObservabilitySignal(signal({ storage: "fine" }), NOW)).toBeNull()
    expect(parseHostObservabilitySignal(signal({ restoreLock: "quiet" }), NOW)).toBeNull()
    expect(parseHostObservabilitySignal(signal({ activationLock: "removed" }), NOW)).toBeNull()
    expect(parseHostObservabilitySignal(signal({ schemaVersion: 1 }), NOW)).toBeNull()
    expect(parseHostObservabilitySignal(signal({ updateSupply: "sideways" }), NOW)).toBeNull()
    expect(parseHostObservabilitySignal(signal({ observedAt: "2026-08-22T12:06:00Z" }), NOW)).toBeNull()
  })

  it("refuses the previous schema that carried registry credential states", () => {
    const legacy: Record<string, unknown> = signal({
      schemaVersion: 1,
      githubReleaseCredential: "configured",
      ghcrCredential: "configured",
    })
    expect(parseHostObservabilitySignal(legacy, NOW)).toBeNull()
  })
})

describe("host-observability Status projection", () => {
  it("projects healthy fixed states and the connected supply route", () => {
    const observations = hostObservabilityObservations(
      parseHostObservabilitySignal(signal(), NOW), NOW,
    )
    expect(observations).toHaveLength(11)
    expect(Object.fromEntries(observations.map(item => [item.component, [item.status, item.code]]))).toEqual({
      "host-storage": ["operational", "HOST_STORAGE_OK"],
      "host-clock": ["operational", "HOST_CLOCK_SYNCHRONIZED"],
      "host-backup": ["operational", "HOST_BACKUP_FRESH"],
      "offhost-backup": ["operational", "OFFHOST_BACKUP_ACKNOWLEDGED"],
      "key-escrow": ["operational", "KEY_ESCROW_ACKNOWLEDGED"],
      "host-update-agent": ["operational", "HOST_UPDATE_AGENT_HEALTHY"],
      "host-certificate": ["operational", "HOST_CERTIFICATE_VALID"],
      "host-services": ["operational", "HOST_SERVICES_HEALTHY"],
      "host-restore-lock": ["operational", "HOST_RESTORE_LOCK_CLEAR"],
      "host-activation-lock": ["operational", "HOST_ACTIVATION_LOCK_CLEAR"],
      "update-supply": ["operational", "UPDATE_SUPPLY_CONNECTED"],
    })
  })

  it("never turns a missing or stale host signal green", () => {
    for (const value of [
      null,
      parseHostObservabilitySignal(signal({ observedAt: "2026-08-22T11:50:00Z" }), NOW),
    ]) {
      const observations = hostObservabilityObservations(value, NOW)
      expect(observations.every(item => item.status === "unknown")).toBe(true)
      expect(observations.every(item => item.code.startsWith("HOST_OBSERVABILITY_"))).toBe(true)
    }
  })

  it("shows each supply route by itself and an invalid mode as an outage", () => {
    const route = (updateSupply: string) => hostObservabilityObservations(
      parseHostObservabilitySignal(signal({ updateSupply }), NOW), NOW,
    ).find(item => item.component === "update-supply")
    expect(route("offline")).toMatchObject({ status: "operational", code: "UPDATE_SUPPLY_OFFLINE" })
    expect(route("connected")).toMatchObject({ status: "operational", code: "UPDATE_SUPPLY_CONNECTED" })
    expect(route("invalid")).toMatchObject({ status: "outage", code: "UPDATE_SUPPLY_MODE_INVALID" })
  })

  it("has readable English and Bulgarian for every projected result", () => {
    const variants = [
      signal(),
      signal({ storage: "low", clock: "unsynchronized", backup: "aging", offHostBackup: "pending", updateAgent: "stale", certificate: "expiring", services: "degraded" }),
      signal({ storage: "critical", clock: "unknown", backup: "overdue", offHostBackup: "overdue", updateAgent: "unknown", certificate: "expired", services: "unknown" }),
      signal({ storage: "unknown", backup: "invalid", offHostBackup: "invalid", updateAgent: "not-installed", certificate: "missing", restoreLock: "present", activationLock: "present" }),
      signal({ restoreLock: "invalid", activationLock: "invalid" }),
      signal({ backup: "missing", offHostBackup: "missing", certificate: "unknown" }),
      signal({ offHostBackup: "not-configured" }),
      signal({ offHostBackup: "aging" }),
      signal({ updateSupply: "offline" }),
      signal({ updateSupply: "invalid" }),
      signal({ keyEscrow: "stale" }),
      signal({ keyEscrow: "missing" }),
      signal({ keyEscrow: "invalid" }),
    ]
    const codes = new Set<string>([
      ...hostObservabilityObservations(null, NOW).map(item => item.code),
      ...hostObservabilityObservations(parseHostObservabilitySignal(signal({ observedAt: "2026-08-22T11:50:00Z" }), NOW), NOW).map(item => item.code),
    ])
    for (const variant of variants) {
      const parsed = parseHostObservabilitySignal(variant, NOW)
      expect(parsed).not.toBeNull()
      for (const observation of hostObservabilityObservations(parsed, NOW)) codes.add(observation.code)
    }
    expect([...codes].filter(code => !CODE_MESSAGE[code])).toEqual([])
    expect([...codes].filter(code => !CODE_MESSAGE_BG[code])).toEqual([])
  })

  it("uses clear Bulgarian wording for protected locks and data-changing operations", () => {
    expect(CODE_MESSAGE_BG.HOST_RESTORE_LOCK_PRESENT).toContain("операция, която променя данни")
    expect(CODE_MESSAGE_BG.HOST_RESTORE_LOCK_PRESENT).not.toContain("разрушителна")
    expect(CODE_MESSAGE_BG.HOST_ACTIVATION_LOCK_INVALID).toContain("защитена директория")
    expect(CODE_MESSAGE_BG.HOST_ACTIVATION_LOCK_INVALID).not.toContain("лична директория")
  })
})
