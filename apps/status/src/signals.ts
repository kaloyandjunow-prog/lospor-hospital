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

const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60_000

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

export async function readSignalObservations(
  signalsDir: string,
  now = Date.now(),
): Promise<CheckObservation[]> {
  const [backupValue, workerValue] = await Promise.all([
    readSignal(join(signalsDir, "backup-status.v1.json")),
    readSignal(join(signalsDir, "delivery-worker-status.v1.json")),
  ])
  const backup = parseBackupSignal(backupValue, now)
  const worker = parseWorkerSignal(workerValue, now)
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
      component: "delivery-worker",
      label: "Central delivery worker",
      group: "research",
      status: workerStatus,
      code: workerCode,
      checkedAt: now,
    },
  ]
}
