import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { CheckObservation } from "./types.js"
import { hasExactKeys, isRecord, safeJsonParse, validIsoDate } from "./util.js"

// Ubuntu, as scripts/host-os-probe.sh reports it: counts, fixed words and times.
// Like the host-observability contract, anything else in the object (a package
// name, a path, free text) invalidates it rather than becoming displayable.

export type HostOsOperation = {
  action: "security-update" | "reboot" | "upgrade"
  result: "passed" | "failed" | "busy" | "started"
  at: string
}

export type HostOsSignal = {
  observedAt: string
  release: string | null
  standardSupportEnds: string | null
  securityUpdates: number | null
  otherUpdates: number | null
  dockerUpdates: boolean | null
  updatesCheckedAt: string | null
  automaticUpdates: "enabled" | "disabled" | "not-installed" | "unknown"
  lastAutomaticRunAt: string | null
  lastAutomaticResult: "success" | "failed" | "never" | "unknown"
  rebootRequired: boolean
  rebootRequiredSince: string | null
  bootedAt: string | null
  rebootPolicy: "manual" | "window"
  lastOperation?: HostOsOperation
}

const MAX_FUTURE_SKEW_MS = 5 * 60_000
const DAY_MS = 24 * 60 * 60_000

const nullableIso = (value: unknown): value is string | null => value === null || validIsoDate(value)
const nullableCount = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100_000)

export function parseHostOsSignal(value: unknown, now = Date.now()): HostOsSignal | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "signalType", "observedAt", "release", "standardSupportEnds", "securityUpdates",
    "otherUpdates", "dockerUpdates", "updatesCheckedAt", "automaticUpdates", "lastAutomaticRunAt",
    "lastAutomaticResult", "rebootRequired", "rebootRequiredSince", "bootedAt", "rebootPolicy",
  ], ["lastOperation"])) return null
  if (value.schemaVersion !== 1 || value.signalType !== "host-os"
    || !validIsoDate(value.observedAt) || Date.parse(value.observedAt) > now + MAX_FUTURE_SKEW_MS) return null
  if (!(value.release === null || (typeof value.release === "string" && /^\d{2}\.\d{2}$/.test(value.release)))) return null
  if (!(value.standardSupportEnds === null
    || (typeof value.standardSupportEnds === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.standardSupportEnds)))) return null
  if (!nullableCount(value.securityUpdates) || !nullableCount(value.otherUpdates)) return null
  if (!(value.dockerUpdates === null || typeof value.dockerUpdates === "boolean")) return null
  if (!nullableIso(value.updatesCheckedAt) || !nullableIso(value.lastAutomaticRunAt)
    || !nullableIso(value.rebootRequiredSince) || !nullableIso(value.bootedAt)) return null
  if (!["enabled", "disabled", "not-installed", "unknown"].includes(String(value.automaticUpdates))) return null
  if (!["success", "failed", "never", "unknown"].includes(String(value.lastAutomaticResult))) return null
  if (typeof value.rebootRequired !== "boolean") return null
  if (value.rebootPolicy !== "manual" && value.rebootPolicy !== "window") return null
  let lastOperation: HostOsOperation | undefined
  if (value.lastOperation !== undefined) {
    const operation = value.lastOperation
    if (!isRecord(operation) || !hasExactKeys(operation, ["action", "result", "at"])) return null
    if (!["security-update", "reboot", "upgrade"].includes(String(operation.action))
      || !["passed", "failed", "busy", "started"].includes(String(operation.result))
      || !validIsoDate(operation.at)) return null
    lastOperation = operation as HostOsOperation
  }
  return {
    observedAt: value.observedAt,
    release: value.release as string | null,
    standardSupportEnds: value.standardSupportEnds as string | null,
    securityUpdates: value.securityUpdates,
    otherUpdates: value.otherUpdates,
    dockerUpdates: value.dockerUpdates as boolean | null,
    updatesCheckedAt: value.updatesCheckedAt,
    automaticUpdates: value.automaticUpdates as HostOsSignal["automaticUpdates"],
    lastAutomaticRunAt: value.lastAutomaticRunAt,
    lastAutomaticResult: value.lastAutomaticResult as HostOsSignal["lastAutomaticResult"],
    rebootRequired: value.rebootRequired,
    rebootRequiredSince: value.rebootRequiredSince,
    bootedAt: value.bootedAt,
    rebootPolicy: value.rebootPolicy,
    ...(lastOperation ? { lastOperation } : {}),
  }
}

export async function readHostOsSignal(stateDir: string, now = Date.now()): Promise<HostOsSignal | null> {
  try {
    const text = await readFile(join(stateDir, "host-os.v1.json"), "utf8")
    return Buffer.byteLength(text) > 4096 ? null : parseHostOsSignal(safeJsonParse(text), now)
  } catch {
    return null
  }
}

/**
 * One row for the operating system. The worst fact wins: an Ubuntu past its
 * support gets no more fixes at all; automatic updates that are off or failing
 * mean fixes stop arriving; then fixes waiting, then a restart nobody has done.
 */
export function hostOsObservation(signal: HostOsSignal | null, now: number): CheckObservation {
  const base = { component: "host-os", label: "Ubuntu security updates", group: "safety" } as const
  if (!signal) return { ...base, status: "unknown", code: "HOST_OS_MISSING", checkedAt: now }
  if (now - Date.parse(signal.observedAt) > 3 * 60_000) {
    return { ...base, status: "unknown", code: "HOST_OS_STALE", checkedAt: now }
  }
  const supportEnds = signal.standardSupportEnds ? Date.parse(`${signal.standardSupportEnds}T23:59:59Z`) : null
  const rebootAge = signal.rebootRequiredSince ? now - Date.parse(signal.rebootRequiredSince) : 0
  // systemd remembers the nightly run only since the server started, so with no
  // run yet the fixes have been waiting at most since boot.
  const lastRunAge = signal.lastAutomaticRunAt ? now - Date.parse(signal.lastAutomaticRunAt)
    : signal.bootedAt ? now - Date.parse(signal.bootedAt) : Number.POSITIVE_INFINITY
  const result = (status: CheckObservation["status"], code: string): CheckObservation => ({ ...base, status, code, checkedAt: now })
  if (supportEnds !== null && now > supportEnds) return result("outage", "HOST_OS_UNSUPPORTED")
  if (signal.automaticUpdates === "disabled" || signal.automaticUpdates === "not-installed") {
    return result("degraded", "HOST_OS_AUTOMATIC_UPDATES_OFF")
  }
  if (signal.lastAutomaticResult === "failed") return result("degraded", "HOST_OS_AUTOMATIC_UPDATES_FAILED")
  if ((signal.securityUpdates ?? 0) > 0 && lastRunAge > 2 * DAY_MS) return result("degraded", "HOST_OS_SECURITY_UPDATES_PENDING")
  if (signal.rebootRequired) {
    // A site that chose restarts in the window is waiting for the window, not
    // for a person, until that has plainly not happened.
    if (signal.rebootPolicy === "window" && rebootAge <= 2 * DAY_MS) return result("operational", "HOST_OS_REBOOT_SCHEDULED")
    return result("degraded", "HOST_OS_REBOOT_REQUIRED")
  }
  if (supportEnds !== null && supportEnds - now < 180 * DAY_MS) return result("degraded", "HOST_OS_SUPPORT_ENDING")
  return result("operational", "HOST_OS_CURRENT")
}
