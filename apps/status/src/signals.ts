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

/**
 * What the host agent is doing about an update, as distinct from whether one
 * exists.
 *
 * Two signals rather than one because they answer different questions and fail
 * separately: appliance-update says what is published, update-agent says
 * whether anything is acting on it. Folding them together would let a dead
 * agent hide behind a healthy release row.
 */
type UpdateAgentSignal = {
  observedAt: string
  phase: "idle" | "accepted" | "queued" | "preparing" | "applying" | "completed" | "failed" | "needs-operator"
  /** The release being acted on, when there is one. */
  targetVersion?: string
  /** Why it failed or what it is waiting for; rendered through CODE_MESSAGE. */
  resultCode?: string
  /** When a queued request will run, so the page can name a time. */
  scheduledFor?: string
}

type UpdateSignal = {
  observedAt: string
  state: "current" | "update-available" | "unknown"
  installedVersion: string
  latestVersion?: string
  fetchedVersion?: string
  /**
   * The digest of the release that has been fetched.
   *
   * Carried so a confirmation can be bound to one exact release: the operator
   * approves what the page showed them, not whatever has landed since. Status
   * never reads a lock file itself.
   */
  fetchedLockSha256?: string
}

const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60_000
const RELEASE_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/

function validObservedAt(value: unknown, now: number): value is string {
  return validIsoDate(value) && Date.parse(value) <= now + MAX_FUTURE_CLOCK_SKEW_MS
}

/**
 * When a queued update is due, which is deliberately in the future.
 *
 * Separate from validObservedAt rather than a flag on it: an observation is a
 * claim about the past and a future one is nonsense, while a schedule is a
 * claim about the future and a past one is merely overdue. Conflating them
 * would let a bad clock pass an observation as a schedule.
 */
function validScheduledFor(value: unknown): value is string {
  return validIsoDate(value)
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
    ["latestVersion", "fetchedVersion", "fetchedLockSha256"],
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
  if (value.fetchedLockSha256 !== undefined
    && (typeof value.fetchedLockSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.fetchedLockSha256))) return null
  return {
    observedAt: value.observedAt,
    state: value.state as UpdateSignal["state"],
    installedVersion: value.installedVersion,
    ...(value.latestVersion === undefined ? {} : { latestVersion: value.latestVersion as string }),
    ...(value.fetchedVersion === undefined ? {} : { fetchedVersion: value.fetchedVersion as string }),
    ...(value.fetchedLockSha256 === undefined ? {} : { fetchedLockSha256: value.fetchedLockSha256 as string }),
  }
}

/**
 * What the host agent is doing, and whether it is alive at all.
 *
 * The agent runs on the host rather than in a container, because applying a
 * release runs `docker compose down` -- a clock inside a container cannot
 * supervise its own restart. Status can only read what it writes.
 */
export function parseUpdateAgentSignal(value: unknown, now = Date.now()): UpdateAgentSignal | null {
  if (!isRecord(value) || !hasExactKeys(
    value,
    ["schemaVersion", "signalType", "observedAt", "phase"],
    ["targetVersion", "resultCode", "scheduledFor"],
  )) return null
  if (value.schemaVersion !== 1 || value.signalType !== "update-agent"
    || !validObservedAt(value.observedAt, now)) return null
  if (!["idle", "accepted", "queued", "preparing", "applying", "completed", "failed", "needs-operator"].includes(String(value.phase))) return null
  if (value.targetVersion !== undefined
    && (typeof value.targetVersion !== "string" || !RELEASE_VERSION.test(value.targetVersion))) return null
  if (value.resultCode !== undefined
    && (typeof value.resultCode !== "string" || !/^[A-Z][A-Z0-9_]{2,63}$/.test(value.resultCode))) return null
  if (value.scheduledFor !== undefined && !validScheduledFor(value.scheduledFor)) return null
  return {
    observedAt: value.observedAt,
    phase: value.phase as UpdateAgentSignal["phase"],
    ...(value.targetVersion === undefined ? {} : { targetVersion: value.targetVersion as string }),
    ...(value.resultCode === undefined ? {} : { resultCode: value.resultCode as string }),
    ...(value.scheduledFor === undefined ? {} : { scheduledFor: value.scheduledFor as string }),
  }
}

/**
 * The agent's own row.
 *
 * A heartbeat older than ten minutes degrades. Without it a dead agent is
 * invisible until UPDATE_CHECK_STALE at fourteen days, which is far too slow to
 * notice that the thing applying security fixes has stopped -- and the whole
 * point of the agent is that nobody is watching it.
 *
 * An update in progress is not a fault: preparing and applying stay
 * operational, because the appliance is doing exactly what it was asked to.
 * Only a failure, or a half-applied release nobody has resolved, is a problem.
 */
export function updateAgentObservation(
  agent: UpdateAgentSignal | null,
  now: number,
): CheckObservation | null {
  const base = { component: "update-agent", label: "Update agent", group: "safety" } as const
  // No signal at all is not a fault. A site that has never installed the agent
  // is running the arrangement it has always run, and inventing a red row for
  // it would be an alarm about a thing the operator did not ask for.
  if (!agent) return null
  if (now - Date.parse(agent.observedAt) > 10 * 60_000) {
    return { ...base, status: "degraded", code: "UPDATE_AGENT_UNAVAILABLE", checkedAt: now }
  }
  if (agent.phase === "needs-operator") {
    return { ...base, status: "outage", code: agent.resultCode ?? "UPDATE_NEEDS_OPERATOR", checkedAt: now }
  }
  if (agent.phase === "failed") {
    return { ...base, status: "degraded", code: agent.resultCode ?? "UPDATE_FAILED", checkedAt: now }
  }
  const code = {
    idle: "UPDATE_AGENT_READY",
    accepted: "UPDATE_ACCEPTED",
    queued: "UPDATE_QUEUED",
    preparing: "UPDATE_PREPARING",
    applying: "UPDATE_APPLYING",
    completed: "UPDATE_COMPLETED",
  }[agent.phase] ?? "UPDATE_AGENT_READY"
  return { ...base, status: "operational", code, checkedAt: now }
}

export async function readSignalObservations(
  signalsDir: string,
  now = Date.now(),
): Promise<CheckObservation[]> {
  const [backupValue, workerValue, retentionValue, updateValue, agentValue] = await Promise.all([
    readSignal(join(signalsDir, "backup-status.v1.json")),
    readSignal(join(signalsDir, "delivery-worker-status.v1.json")),
    readSignal(join(signalsDir, "retention-status.v1.json")),
    readSignal(join(signalsDir, "appliance-update.v1.json")),
    readSignal(join(signalsDir, "update-agent.v1.json")),
  ])
  const backup = parseBackupSignal(backupValue, now)
  const worker = parseWorkerSignal(workerValue, now)
  const retention = parseRetentionSignal(retentionValue, now)
  const update = parseUpdateSignal(updateValue, now)
  const agent = parseUpdateAgentSignal(agentValue, now)
  const agentObservation = updateAgentObservation(agent, now)
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
    // Only when an agent is actually installed. A site running the older
    // arrangement gets no row rather than a red one about a thing it never
    // asked for.
    ...(agentObservation ? [agentObservation] : []),
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
