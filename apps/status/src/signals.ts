import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { CheckObservation } from "./types.js"
import { finiteInteger, hasExactKeys, isRecord, safeJsonParse, validIsoDate } from "./util.js"

type BackupSignal = {
  observedAt: string
  state: "SUCCESS" | "FAILURE"
  resultCode: "BACKUP_VERIFIED" | "PG_DUMP_FAILED" | "ARTIFACT_FINALIZE_FAILED" | "CHECKSUM_FAILED"
}

type WorkerSignal = {
  observedAt: string
  state: "SUCCESS" | "FAILURE"
  resultCode: "PROCESS_REQUEST_ACCEPTED" | "API_UNAVAILABLE" | "PROCESS_REQUEST_REJECTED"
}

type RetentionSignal = {
  observedAt: string
  state: "SUCCESS" | "FAILURE"
  resultCode: "RETENTION_COMPLETED" | "RETENTION_API_UNAVAILABLE" | "RETENTION_REJECTED"
}

type UpdateSignal = {
  observedAt: string
  state: "current" | "update-available" | "unknown"
  installedVersion: string
  latestVersion?: string
  fetchedVersion?: string
}

const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60_000
const RELEASE_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/

function validObservedAt(value: unknown, now: number): value is string {
  return validIsoDate(value) && Date.parse(value) <= now + MAX_FUTURE_CLOCK_SKEW_MS
}

async function readSignal(path: string): Promise<unknown> {
  try {
    const text = await readFile(path, "utf8")
    if (Buffer.byteLength(text) > 4096) return null
    return safeJsonParse(text)
  } catch {
    return null
  }
}

export function parseBackupSignal(value: unknown, now = Date.now()): BackupSignal | null {
  if (!isRecord(value) || !hasExactKeys(
    value,
    ["schemaVersion", "signalType", "observedAt", "state", "resultCode"],
    ["artifactBytes", "checksumAlgorithm"],
  )) return null
  if (value.schemaVersion !== 1 || value.signalType !== "backup" || !validObservedAt(value.observedAt, now)) return null
  const success = value.state === "SUCCESS" && value.resultCode === "BACKUP_VERIFIED"
  const failure = value.state === "FAILURE"
    && ["PG_DUMP_FAILED", "ARTIFACT_FINALIZE_FAILED", "CHECKSUM_FAILED"].includes(String(value.resultCode))
  if (!success && !failure) return null
  if (success && (!finiteInteger(value.artifactBytes, 0) || value.checksumAlgorithm !== "sha256")) return null
  if (value.artifactBytes !== undefined && !finiteInteger(value.artifactBytes, 0)) return null
  if (value.checksumAlgorithm !== undefined && value.checksumAlgorithm !== "sha256") return null
  return {
    observedAt: value.observedAt,
    state: value.state as BackupSignal["state"],
    resultCode: value.resultCode as BackupSignal["resultCode"],
  }
}

export function parseWorkerSignal(value: unknown, now = Date.now()): WorkerSignal | null {
  if (!isRecord(value) || !hasExactKeys(
    value,
    ["schemaVersion", "signalType", "observedAt", "state", "resultCode"],
    ["httpStatusCategory"],
  )) return null
  if (value.schemaVersion !== 1 || value.signalType !== "delivery-worker" || !validObservedAt(value.observedAt, now)) return null
  const success = value.state === "SUCCESS" && value.resultCode === "PROCESS_REQUEST_ACCEPTED"
  const failure = value.state === "FAILURE"
    && ["API_UNAVAILABLE", "PROCESS_REQUEST_REJECTED"].includes(String(value.resultCode))
  if (!success && !failure) return null
  if (value.httpStatusCategory !== undefined && !finiteInteger(value.httpStatusCategory, 1, 5)) return null
  return {
    observedAt: value.observedAt,
    state: value.state as WorkerSignal["state"],
    resultCode: value.resultCode as WorkerSignal["resultCode"],
  }
}

export function parseRetentionSignal(value: unknown, now = Date.now()): RetentionSignal | null {
  if (!isRecord(value) || !hasExactKeys(
    value,
    ["schemaVersion", "signalType", "observedAt", "state", "resultCode"],
  )) return null
  if (value.schemaVersion !== 1 || value.signalType !== "retention" || !validObservedAt(value.observedAt, now)) return null
  const success = value.state === "SUCCESS" && value.resultCode === "RETENTION_COMPLETED"
  const failure = value.state === "FAILURE"
    && ["RETENTION_API_UNAVAILABLE", "RETENTION_REJECTED"].includes(String(value.resultCode))
  if (!success && !failure) return null
  return {
    observedAt: value.observedAt,
    state: value.state as RetentionSignal["state"],
    resultCode: value.resultCode as RetentionSignal["resultCode"],
  }
}

/**
 * The appliance's own view of whether a newer release has been published.
 *
 * "unknown" is a first-class state, not an error to be smoothed over. A site
 * whose network is down, or whose registry credential has been revoked, must
 * show that it does not know -- never that it is up to date. Reporting a
 * comfortable answer from a failed check is the specific harm this guards.
 */
export function parseUpdateSignal(value: unknown, now = Date.now()): UpdateSignal | null {
  if (!isRecord(value) || !hasExactKeys(
    value,
    ["schemaVersion", "signalType", "observedAt", "state", "installedVersion"],
    ["latestVersion", "fetchedVersion"],
  )) return null
  if (value.schemaVersion !== 1 || value.signalType !== "appliance-update"
    || !validObservedAt(value.observedAt, now)) return null
  if (!["current", "update-available", "unknown"].includes(String(value.state))) return null
  // The installed version may be "-" before a first installation has completed.
  if (typeof value.installedVersion !== "string"
    || (value.installedVersion !== "-" && !RELEASE_VERSION.test(value.installedVersion))) return null
  for (const optional of [value.latestVersion, value.fetchedVersion]) {
    if (optional !== undefined && (typeof optional !== "string" || !RELEASE_VERSION.test(optional))) return null
  }
  // An update cannot be "available" without naming what is available: a signal
  // claiming one without a version would render as an alarm nobody can act on.
  if (value.state === "update-available" && value.latestVersion === undefined) return null
  return {
    observedAt: value.observedAt,
    state: value.state as UpdateSignal["state"],
    installedVersion: value.installedVersion,
    ...(value.latestVersion === undefined ? {} : { latestVersion: value.latestVersion as string }),
    ...(value.fetchedVersion === undefined ? {} : { fetchedVersion: value.fetchedVersion as string }),
  }
}

export async function readSignalObservations(
  signalsDir: string,
  now = Date.now(),
): Promise<CheckObservation[]> {
  const [backupValue, workerValue, retentionValue, updateValue] = await Promise.all([
    readSignal(join(signalsDir, "backup-status.v1.json")),
    readSignal(join(signalsDir, "delivery-worker-status.v1.json")),
    readSignal(join(signalsDir, "retention-status.v1.json")),
    readSignal(join(signalsDir, "appliance-update.v1.json")),
  ])
  const backup = parseBackupSignal(backupValue, now)
  const worker = parseWorkerSignal(workerValue, now)
  const retention = parseRetentionSignal(retentionValue, now)
  const update = parseUpdateSignal(updateValue, now)
  const backupAge = backup ? now - Date.parse(backup.observedAt) : Number.POSITIVE_INFINITY
  const workerAge = worker ? now - Date.parse(worker.observedAt) : Number.POSITIVE_INFINITY

  let backupStatus: CheckObservation["status"] = "unknown"
  let backupCode = "BACKUP_SIGNAL_MISSING"
  if (backup) {
    if (backup.state === "FAILURE") {
      backupStatus = "outage"
      backupCode = backup.resultCode
    } else if (backupAge > 48 * 60 * 60_000) {
      backupStatus = "outage"
      backupCode = "BACKUP_OVERDUE"
    } else if (backupAge > 36 * 60 * 60_000) {
      backupStatus = "degraded"
      backupCode = "BACKUP_AGING"
    } else {
      backupStatus = "operational"
      backupCode = "BACKUP_VERIFIED"
    }
  }

  let workerStatus: CheckObservation["status"] = "unknown"
  let workerCode = "DELIVERY_WORKER_SIGNAL_MISSING"
  if (worker) {
    if (workerAge > 300_000) {
      workerStatus = "outage"
      workerCode = "DELIVERY_WORKER_STALE"
    } else if (workerAge > 150_000) {
      workerStatus = "degraded"
      workerCode = "DELIVERY_WORKER_DELAYED"
    } else if (worker.state === "FAILURE") {
      workerStatus = "degraded"
      workerCode = worker.resultCode
    } else {
      workerStatus = "operational"
      workerCode = "DELIVERY_WORKER_ACTIVE"
    }
  }

  // Retention runs daily, so it is aged like the backup rather than like the
  // delivery worker. A missing signal is "unknown" and not "operational": an
  // erasure obligation nobody can show evidence for is exactly the thing that
  // must not read as green.
  const retentionAge = retention ? now - Date.parse(retention.observedAt) : Number.POSITIVE_INFINITY
  let retentionStatus: CheckObservation["status"] = "unknown"
  let retentionCode = "RETENTION_SIGNAL_MISSING"
  if (retention) {
    if (retention.state === "FAILURE") {
      retentionStatus = "outage"
      retentionCode = retention.resultCode
    } else if (retentionAge > 48 * 60 * 60_000) {
      retentionStatus = "outage"
      retentionCode = "RETENTION_OVERDUE"
    } else if (retentionAge > 36 * 60 * 60_000) {
      retentionStatus = "degraded"
      retentionCode = "RETENTION_AGING"
    } else {
      retentionStatus = "operational"
      retentionCode = "RETENTION_COMPLETED"
    }
  }

  return [
    {
      component: "backup",
      label: "Verified backup",
      group: "safety",
      status: backupStatus,
      code: backupCode,
      checkedAt: now,
    },
    {
      component: "retention",
      label: "Data retention purge",
      group: "safety",
      status: retentionStatus,
      code: retentionCode,
      checkedAt: now,
    },
    {
      component: "delivery-worker",
      label: "Central delivery worker",
      group: "research",
      status: workerStatus,
      code: workerCode,
      checkedAt: now,
    },
    updateObservation(update, now),
  ]
}

/**
 * An available update is information, not a fault.
 *
 * It reports "operational" rather than "degraded" so a routine pending update
 * cannot turn the whole appliance amber. A box running a slightly older release
 * is working correctly; treating that as a defect trains people to ignore the
 * colour, and the colour is what has to still mean something at 3am when
 * something is genuinely wrong.
 *
 * A stale check is different, and does degrade: if nobody has successfully
 * asked for a fortnight, the site no longer knows whether it is missing a fix.
 */
function updateObservation(update: UpdateSignal | null, now: number): CheckObservation {
  const base = { component: "appliance-update", label: "Appliance release", group: "safety" } as const
  if (!update) {
    return { ...base, status: "unknown", code: "UPDATE_CHECK_NEVER_RUN", checkedAt: now }
  }
  if (update.state === "unknown") {
    return { ...base, status: "unknown", code: "UPDATE_CHECK_FAILED", checkedAt: now }
  }
  if (now - Date.parse(update.observedAt) > 14 * 24 * 60 * 60_000) {
    return { ...base, status: "degraded", code: "UPDATE_CHECK_STALE", checkedAt: now }
  }
  if (update.state === "update-available") {
    const staged = update.fetchedVersion !== undefined && update.fetchedVersion === update.latestVersion
    return {
      ...base,
      status: "operational",
      code: staged ? "UPDATE_DOWNLOADED_READY_TO_APPLY" : "UPDATE_AVAILABLE",
      checkedAt: now,
    }
  }
  return { ...base, status: "operational", code: "RELEASE_CURRENT", checkedAt: now }
}
