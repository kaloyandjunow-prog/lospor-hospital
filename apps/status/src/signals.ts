import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { hostOsObservation, parseHostOsSignal } from "./host-os.js"
import type { CheckObservation } from "./types.js"
import { finiteInteger, hasExactKeys, isRecord, safeJsonParse, validIsoDate } from "./util.js"

export const BACKUP_FAILURE_CODES = [
  "ARTIFACT_FINALIZE_FAILED",
  "BACKUP_CAPACITY_CHECK_FAILED",
  "BACKUP_CAPACITY_REFUSED",
  "BACKUP_CLOCK_INVALID",
  "BACKUP_COMPATIBILITY_METADATA_INVALID",
  "BACKUP_DATABASE_SIZE_FAILED",
  "BACKUP_DUMP_CATALOG_INVALID",
  "BACKUP_FSYNC_FAILED",
  "BACKUP_KEY_FINGERPRINT_INVALID",
  "BACKUP_LOCK_FAILED",
  "BACKUP_MANIFEST_AUTH_FAILED",
  "BACKUP_MANIFEST_AUTH_KEY_INVALID",
  "BACKUP_MANIFEST_FINALIZE_FAILED",
  "BACKUP_MARKER_WRITE_FAILED",
  "BACKUP_MIGRATION_FINGERPRINT_FAILED",
  "BACKUP_POSTGRES_VERSION_FAILED",
  "BACKUP_PUBLISHED_VERIFY_FAILED",
  "BACKUP_RETENTION_PIN_FAILED",
  "BACKUP_RUN_ID_INVALID",
  "BACKUP_SCHEMA_FINGERPRINT_FAILED",
  "BACKUP_SIGNAL_WRITE_FAILED",
  "BACKUP_TEMP_CREATE_FAILED",
  "CHECKSUM_FAILED",
  "PG_DUMP_FAILED",
] as const

type BackupFailureCode = (typeof BACKUP_FAILURE_CODES)[number]

type BackupSignal = {
  observedAt: string
  state: "SUCCESS" | "FAILURE"
  resultCode: "BACKUP_VERIFIED" | BackupFailureCode
}

type WorkerSignal = {
  observedAt: string
  state: "SUCCESS" | "FAILURE"
  resultCode: "PROCESS_REQUEST_ACCEPTED" | "API_UNAVAILABLE" | "PROCESS_REQUEST_REJECTED"
}

type RetentionSignal = {
  observedAt: string
  state: "SUCCESS" | "FAILURE"
  resultCode: "RETENTION_COMPLETED" | "RETENTION_API_UNAVAILABLE" | "RETENTION_REJECTED" | "RETENTION_EHR_STAGING_REJECTED"
}

type CaseCloseSignal = {
  observedAt: string
  state: "SUCCESS" | "FAILURE"
  resultCode: "CASE_CLOSE_COMPLETED" | "CASE_CLOSE_API_UNAVAILABLE" | "CASE_CLOSE_REJECTED"
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
export type UpdateAgentSignal = {
  observedAt: string
  phase: "idle" | "accepted" | "queued" | "preparing" | "prepared" | "applying" | "completed" | "failed" | "needs-operator"
  /** The release being acted on, when there is one. */
  targetVersion?: string
  /** Why it failed or what it is waiting for; rendered through CODE_MESSAGE. */
  resultCode?: string
  /** When a queued request will run, so the page can name a time. */
  scheduledFor?: string
  /** Exact root-owned prepared identity projected without exposing a path. */
  preparedVersion?: string
  preparedLockSha256?: string
  rollbackPolicy?: "service-compatible" | "backup-required"
}

export type UpdateAgentInstallationSignal = {
  observedAt: string
  mode: "agent" | "console-only"
}

/**
 * Sanitized terminology state projected by the root host agent.
 *
 * No source path, database name, licence text, filenames, row-level content,
 * log output, or credential can cross this contract. Package/version and the
 * approved manifest digest are the minimum provenance an operator needs to
 * identify the active generation.
 */
export type TerminologyAgentSignal = {
  observedAt: string
  phase: "idle" | "accepted" | "working" | "completed" | "failed" | "needs-operator"
  resultCode: string
  rollbackAvailable: boolean
  lastAction?: "import" | "resume" | "rollback" | "finalize"
  pendingPhase?: "verified" | "staged" | "importing" | "validated" | "activating"
  packageId?: string
  packageVersion?: string
  activatedAt?: string
  manifestSha256?: string
}

export type HostObservabilitySignal = {
  observedAt: string
  storage: "ok" | "low" | "critical" | "unknown"
  clock: "synchronized" | "unsynchronized" | "unknown"
  backup: "fresh" | "aging" | "overdue" | "missing" | "invalid"
  offHostBackup: "acknowledged" | "aging" | "pending" | "overdue" | "missing" | "invalid" | "not-configured"
  /**
   * Whether the installation secrets are acknowledged as escrowed off this
   * appliance -- not whether they are, because the appliance cannot see inside
   * the hospital's safe. "stale" means the acknowledgement no longer describes
   * the keys actually in use.
   */
  keyEscrow: "acknowledged" | "stale" | "missing" | "invalid"
  updateAgent: "healthy" | "stale" | "not-installed" | "unknown"
  certificate: "valid" | "expiring" | "expired" | "missing" | "unknown"
  services: "healthy" | "degraded" | "unknown"
  restoreLock: "clear" | "present" | "invalid"
  activationLock: "clear" | "present" | "invalid"
  updateSupply: "connected" | "offline" | "invalid"
}

export type UpdateSignal = {
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
    && BACKUP_FAILURE_CODES.includes(value.resultCode as BackupFailureCode)
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
    && ["RETENTION_API_UNAVAILABLE", "RETENTION_REJECTED", "RETENTION_EHR_STAGING_REJECTED"].includes(String(value.resultCode))
  if (!success && !failure) return null
  return {
    observedAt: value.observedAt,
    state: value.state as RetentionSignal["state"],
    resultCode: value.resultCode as RetentionSignal["resultCode"],
  }
}

export function parseCaseCloseSignal(value: unknown, now = Date.now()): CaseCloseSignal | null {
  if (!isRecord(value) || !hasExactKeys(
    value,
    ["schemaVersion", "signalType", "observedAt", "state", "resultCode"],
  )) return null
  if (value.schemaVersion !== 1 || value.signalType !== "case-close" || !validObservedAt(value.observedAt, now)) return null
  const success = value.state === "SUCCESS" && value.resultCode === "CASE_CLOSE_COMPLETED"
  const failure = value.state === "FAILURE"
    && ["CASE_CLOSE_API_UNAVAILABLE", "CASE_CLOSE_REJECTED"].includes(String(value.resultCode))
  if (!success && !failure) return null
  return {
    observedAt: value.observedAt,
    state: value.state as CaseCloseSignal["state"],
    resultCode: value.resultCode as CaseCloseSignal["resultCode"],
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
    ["targetVersion", "resultCode", "scheduledFor", "preparedVersion", "preparedLockSha256", "rollbackPolicy"],
  )) return null
  if (![1, 2].includes(value.schemaVersion as number) || value.signalType !== "update-agent"
    || !validObservedAt(value.observedAt, now)) return null
  if (!["idle", "accepted", "queued", "preparing", "prepared", "applying", "completed", "failed", "needs-operator"].includes(String(value.phase))) return null
  if (value.targetVersion !== undefined
    && (typeof value.targetVersion !== "string" || !RELEASE_VERSION.test(value.targetVersion))) return null
  if (value.resultCode !== undefined
    && (typeof value.resultCode !== "string" || !/^[A-Z][A-Z0-9_]{2,63}$/.test(value.resultCode))) return null
  if (value.scheduledFor !== undefined && !validScheduledFor(value.scheduledFor)) return null
  if (value.preparedVersion !== undefined
    && (typeof value.preparedVersion !== "string" || !RELEASE_VERSION.test(value.preparedVersion))) return null
  if (value.preparedLockSha256 !== undefined
    && (typeof value.preparedLockSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.preparedLockSha256))) return null
  if (value.rollbackPolicy !== undefined
    && !["service-compatible", "backup-required"].includes(String(value.rollbackPolicy))) return null
  if (value.schemaVersion === 1
    && [value.preparedVersion, value.preparedLockSha256, value.rollbackPolicy].some(item => item !== undefined)) return null
  const preparedFields = [value.preparedVersion, value.preparedLockSha256, value.rollbackPolicy]
  if (preparedFields.some(item => item !== undefined) && preparedFields.some(item => item === undefined)) return null
  if (value.phase === "prepared" && preparedFields.some(item => item === undefined)) return null
  return {
    observedAt: value.observedAt,
    phase: value.phase as UpdateAgentSignal["phase"],
    ...(value.targetVersion === undefined ? {} : { targetVersion: value.targetVersion as string }),
    ...(value.resultCode === undefined ? {} : { resultCode: value.resultCode as string }),
    ...(value.scheduledFor === undefined ? {} : { scheduledFor: value.scheduledFor as string }),
    ...(value.preparedVersion === undefined ? {} : { preparedVersion: value.preparedVersion as string }),
    ...(value.preparedLockSha256 === undefined ? {} : { preparedLockSha256: value.preparedLockSha256 as string }),
    ...(value.rollbackPolicy === undefined ? {} : { rollbackPolicy: value.rollbackPolicy as UpdateAgentSignal["rollbackPolicy"] }),
  }
}

export function parseUpdateAgentInstallationSignal(
  value: unknown,
  now = Date.now(),
): UpdateAgentInstallationSignal | null {
  if (!isRecord(value) || !hasExactKeys(
    value,
    ["schemaVersion", "signalType", "observedAt", "mode"],
  )) return null
  if (value.schemaVersion !== 1 || value.signalType !== "update-agent-installation"
    || !validObservedAt(value.observedAt, now)) return null
  if (value.mode !== "agent" && value.mode !== "console-only") return null
  return { observedAt: value.observedAt, mode: value.mode }
}

export function parseTerminologyAgentSignal(
  value: unknown,
  now = Date.now(),
): TerminologyAgentSignal | null {
  if (!isRecord(value) || !hasExactKeys(
    value,
    ["schemaVersion", "signalType", "observedAt", "phase", "resultCode", "rollbackAvailable"],
    ["lastAction", "pendingPhase", "packageId", "packageVersion", "activatedAt", "manifestSha256"],
  )) return null
  if (value.schemaVersion !== 1 || value.signalType !== "terminology-agent"
    || !validObservedAt(value.observedAt, now)) return null
  if (!["idle", "accepted", "working", "completed", "failed", "needs-operator"]
    .includes(String(value.phase))) return null
  if (typeof value.resultCode !== "string" || !/^[A-Z][A-Z0-9_]{2,63}$/.test(value.resultCode)
    || typeof value.rollbackAvailable !== "boolean") return null
  if (value.lastAction !== undefined
    && !["import", "resume", "rollback", "finalize"].includes(String(value.lastAction))) return null
  if (value.pendingPhase !== undefined
    && !["verified", "staged", "importing", "validated", "activating"].includes(String(value.pendingPhase))) return null
  const activeFields = [value.packageId, value.packageVersion, value.activatedAt, value.manifestSha256]
  if (activeFields.some(item => item !== undefined) && activeFields.some(item => item === undefined)) return null
  if (value.packageId !== undefined
    && (typeof value.packageId !== "string" || !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(value.packageId))) return null
  if (value.packageVersion !== undefined
    && (typeof value.packageVersion !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/.test(value.packageVersion))) return null
  if (value.activatedAt !== undefined && !validIsoDate(value.activatedAt)) return null
  if (value.manifestSha256 !== undefined
    && (typeof value.manifestSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.manifestSha256))) return null
  return {
    observedAt: value.observedAt,
    phase: value.phase as TerminologyAgentSignal["phase"],
    resultCode: value.resultCode,
    rollbackAvailable: value.rollbackAvailable,
    ...(value.lastAction === undefined ? {} : { lastAction: value.lastAction as TerminologyAgentSignal["lastAction"] }),
    ...(value.pendingPhase === undefined ? {} : { pendingPhase: value.pendingPhase as TerminologyAgentSignal["pendingPhase"] }),
    ...(value.packageId === undefined ? {} : {
      packageId: value.packageId as string,
      packageVersion: value.packageVersion as string,
      activatedAt: value.activatedAt as string,
      manifestSha256: value.manifestSha256 as string,
    }),
  }
}

/**
 * Strict privacy boundary for host observations.
 *
 * The root probe can see filesystems, service metadata and protected update
 * credentials. Status must not. This contract accepts only fixed enums and a
 * timestamp; an extra field (including a path, hostname or free-text detail)
 * invalidates the complete snapshot rather than becoming displayable data.
 */
export function parseHostObservabilitySignal(
  value: unknown,
  now = Date.now(),
): HostObservabilitySignal | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "signalType", "observedAt", "storage", "clock", "backup",
    "offHostBackup", "keyEscrow", "updateAgent", "certificate", "services", "updateSupply",
    "restoreLock", "activationLock",
  ])) return null
  if (value.schemaVersion !== 2 || value.signalType !== "host-observability"
    || !validObservedAt(value.observedAt, now)) return null
  if (!["ok", "low", "critical", "unknown"].includes(String(value.storage))) return null
  if (!["synchronized", "unsynchronized", "unknown"].includes(String(value.clock))) return null
  if (!["fresh", "aging", "overdue", "missing", "invalid"].includes(String(value.backup))) return null
  if (!["acknowledged", "aging", "pending", "overdue", "missing", "invalid", "not-configured"]
    .includes(String(value.offHostBackup))) return null
  if (!["acknowledged", "stale", "missing", "invalid"]
    .includes(String(value.keyEscrow))) return null
  if (!["healthy", "stale", "not-installed", "unknown"].includes(String(value.updateAgent))) return null
  if (!["valid", "expiring", "expired", "missing", "unknown"].includes(String(value.certificate))) return null
  if (!["healthy", "degraded", "unknown"].includes(String(value.services))) return null
  if (!["clear", "present", "invalid"].includes(String(value.restoreLock))) return null
  if (!["clear", "present", "invalid"].includes(String(value.activationLock))) return null
  if (!["connected", "offline", "invalid"].includes(String(value.updateSupply))) return null
  return {
    observedAt: value.observedAt,
    storage: value.storage as HostObservabilitySignal["storage"],
    clock: value.clock as HostObservabilitySignal["clock"],
    backup: value.backup as HostObservabilitySignal["backup"],
    offHostBackup: value.offHostBackup as HostObservabilitySignal["offHostBackup"],
    keyEscrow: value.keyEscrow as HostObservabilitySignal["keyEscrow"],
    updateAgent: value.updateAgent as HostObservabilitySignal["updateAgent"],
    certificate: value.certificate as HostObservabilitySignal["certificate"],
    services: value.services as HostObservabilitySignal["services"],
    restoreLock: value.restoreLock as HostObservabilitySignal["restoreLock"],
    activationLock: value.activationLock as HostObservabilitySignal["activationLock"],
    updateSupply: value.updateSupply as HostObservabilitySignal["updateSupply"],
  }
}

export function hostObservabilityObservations(
  signal: HostObservabilitySignal | null,
  now = Date.now(),
): CheckObservation[] {
  const bases = [
    { component: "host-storage", label: "Host storage capacity" },
    { component: "host-clock", label: "Host clock synchronization" },
    { component: "host-backup", label: "Host backup freshness" },
    { component: "offhost-backup", label: "Off-host backup acknowledgement" },
    { component: "key-escrow", label: "Installation secrets escrow" },
    { component: "host-update-agent", label: "Host update-agent service" },
    { component: "host-certificate", label: "HTTPS certificate expiry" },
    { component: "host-services", label: "Host service health" },
    { component: "host-restore-lock", label: "Restore operation lock" },
    { component: "host-activation-lock", label: "Release activation lock" },
    { component: "update-supply", label: "Update supply route" },
  ] as const
  if (!signal) {
    return bases.map(base => ({
      ...base, group: "safety", status: "unknown", code: "HOST_OBSERVABILITY_MISSING", checkedAt: now,
    }))
  }
  if (now - Date.parse(signal.observedAt) > 3 * 60_000) {
    return bases.map(base => ({
      ...base, group: "safety", status: "unknown", code: "HOST_OBSERVABILITY_STALE", checkedAt: now,
    }))
  }

  const storage = signal.storage === "ok"
    ? ["operational", "HOST_STORAGE_OK"]
    : signal.storage === "low"
      ? ["degraded", "HOST_STORAGE_LOW"]
      : signal.storage === "critical"
        ? ["outage", "HOST_STORAGE_CRITICAL"]
        : ["unknown", "HOST_STORAGE_UNKNOWN"]
  const clock = signal.clock === "synchronized"
    ? ["operational", "HOST_CLOCK_SYNCHRONIZED"]
    : signal.clock === "unsynchronized"
      ? ["outage", "HOST_CLOCK_UNSYNCHRONIZED"]
      : ["unknown", "HOST_CLOCK_UNKNOWN"]
  const backup = signal.backup === "fresh"
    ? ["operational", "HOST_BACKUP_FRESH"]
    : signal.backup === "aging"
      ? ["degraded", "HOST_BACKUP_AGING"]
      : signal.backup === "overdue"
        ? ["outage", "HOST_BACKUP_OVERDUE"]
        : signal.backup === "invalid"
          ? ["outage", "HOST_BACKUP_EVIDENCE_INVALID"]
          : ["unknown", "HOST_BACKUP_MISSING"]
  const offHost = signal.offHostBackup === "acknowledged"
    ? ["operational", "OFFHOST_BACKUP_ACKNOWLEDGED"]
    : signal.offHostBackup === "not-configured"
      ? ["not-configured", "OFFHOST_BACKUP_NOT_CONFIGURED"]
      : signal.offHostBackup === "overdue"
        ? ["outage", "OFFHOST_BACKUP_OVERDUE"]
        : signal.offHostBackup === "invalid"
          ? ["outage", "OFFHOST_BACKUP_EVIDENCE_INVALID"]
          : signal.offHostBackup === "missing"
            ? ["degraded", "OFFHOST_BACKUP_MISSING"]
            : signal.offHostBackup === "pending"
              ? ["degraded", "OFFHOST_BACKUP_PENDING"]
              : ["degraded", "OFFHOST_BACKUP_AGING"]
  // Degraded rather than outage when missing: nothing is broken today. What is
  // missing is the only thing that would make this appliance's patient
  // identities recoverable tomorrow, since backups hold key fingerprints and
  // never keys. Stale is worse than missing — an acknowledgement that no longer
  // describes the keys in use is a false assurance, and someone read it once.
  const escrow = signal.keyEscrow === "acknowledged"
    ? ["operational", "KEY_ESCROW_ACKNOWLEDGED"]
    : signal.keyEscrow === "stale"
      ? ["outage", "KEY_ESCROW_STALE"]
      : signal.keyEscrow === "invalid"
        ? ["outage", "KEY_ESCROW_EVIDENCE_INVALID"]
        : ["degraded", "KEY_ESCROW_MISSING"]
  const agent = signal.updateAgent === "healthy"
    ? ["operational", "HOST_UPDATE_AGENT_HEALTHY"]
    : signal.updateAgent === "stale"
      ? ["degraded", "HOST_UPDATE_AGENT_STALE"]
      : signal.updateAgent === "not-installed"
        ? ["not-configured", "HOST_UPDATE_AGENT_CONSOLE_ONLY"]
        : ["unknown", "HOST_UPDATE_AGENT_UNKNOWN"]
  const certificate = signal.certificate === "valid"
    ? ["operational", "HOST_CERTIFICATE_VALID"]
    : signal.certificate === "expiring"
      ? ["degraded", "HOST_CERTIFICATE_EXPIRING"]
      : signal.certificate === "expired"
        ? ["outage", "HOST_CERTIFICATE_EXPIRED"]
        : signal.certificate === "missing"
          ? ["outage", "HOST_CERTIFICATE_MISSING"]
          : ["unknown", "HOST_CERTIFICATE_UNKNOWN"]
  const services = signal.services === "healthy"
    ? ["operational", "HOST_SERVICES_HEALTHY"]
    : signal.services === "degraded"
      ? ["outage", "HOST_SERVICES_DEGRADED"]
      : ["unknown", "HOST_SERVICES_UNKNOWN"]
  const restoreLock = signal.restoreLock === "clear"
    ? ["operational", "HOST_RESTORE_LOCK_CLEAR"]
    : signal.restoreLock === "present"
      ? ["degraded", "HOST_RESTORE_LOCK_PRESENT"]
      : ["outage", "HOST_RESTORE_LOCK_INVALID"]
  const activationLock = signal.activationLock === "clear"
    ? ["operational", "HOST_ACTIVATION_LOCK_CLEAR"]
    : signal.activationLock === "present"
      ? ["outage", "HOST_ACTIVATION_LOCK_PRESENT"]
      : ["outage", "HOST_ACTIVATION_LOCK_INVALID"]

  const supply = signal.updateSupply === "offline"
    ? ["operational", "UPDATE_SUPPLY_OFFLINE"]
    : signal.updateSupply === "connected"
      ? ["operational", "UPDATE_SUPPLY_CONNECTED"]
      : ["outage", "UPDATE_SUPPLY_MODE_INVALID"]

  const derived = [
    storage, clock, backup, offHost, escrow, agent, certificate, services,
    restoreLock, activationLock, supply,
  ] as const
  return bases.map((base, index) => ({
    ...base,
    group: "safety" as const,
    status: derived[index]![0] as CheckObservation["status"],
    code: derived[index]![1],
    checkedAt: now,
  }))
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
  installation: UpdateAgentInstallationSignal | null = null,
): CheckObservation | null {
  const base = { component: "update-agent", label: "Update agent", group: "safety" } as const
  // No signal at all is not a fault. A site that has never installed the agent
  // is running the arrangement it has always run, and inventing a red row for
  // it would be an alarm about a thing the operator did not ask for.
  if (installation?.mode === "console-only") {
    return { ...base, status: "operational", code: "UPDATE_CONSOLE_ONLY", checkedAt: now }
  }
  if (!agent) {
    return installation?.mode === "agent"
      ? { ...base, status: "outage", code: "UPDATE_AGENT_CONFIGURED_FAILED", checkedAt: now }
      : null
  }
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
    prepared: "UPDATE_PREPARED",
    applying: "UPDATE_APPLYING",
    completed: "UPDATE_COMPLETED",
  }[agent.phase] ?? "UPDATE_AGENT_READY"
  return { ...base, status: "operational", code, checkedAt: now }
}

/** The published-release signal on its own, for the release page. */
export async function readUpdateSignal(
  signalsDir: string,
  now = Date.now(),
): Promise<UpdateSignal | null> {
  return parseUpdateSignal(await readSignal(join(signalsDir, "appliance-update.v1.json")), now)
}

/** The agent's signal on its own. It lives beside the agent, not in /signals. */
export async function readAgentSignal(
  stateDir: string,
  now = Date.now(),
): Promise<UpdateAgentSignal | null> {
  const current = parseUpdateAgentSignal(await readSignal(join(stateDir, "update-agent.v2.json")), now)
  return current ?? parseUpdateAgentSignal(await readSignal(join(stateDir, "update-agent.v1.json")), now)
}

export async function readAgentInstallationSignal(
  stateDir: string,
  now = Date.now(),
): Promise<UpdateAgentInstallationSignal | null> {
  return parseUpdateAgentInstallationSignal(
    await readSignal(join(stateDir, "update-agent-installation.v1.json")),
    now,
  )
}

export async function readTerminologyAgentSignal(
  stateDir: string,
  now = Date.now(),
): Promise<TerminologyAgentSignal | null> {
  return parseTerminologyAgentSignal(
    await readSignal(join(stateDir, "terminology-agent.v1.json")),
    now,
  )
}

export async function readSignalObservations(
  signalsDir: string,
  now = Date.now(),
  updateStateDir?: string,
): Promise<CheckObservation[]> {
  const [backupValue, workerValue, retentionValue, caseCloseValue, updateValue, agentValue, agentInstallationValue, hostValue, hostOsValue] = await Promise.all([
    readSignal(join(signalsDir, "backup-status.v1.json")),
    readSignal(join(signalsDir, "delivery-worker-status.v1.json")),
    readSignal(join(signalsDir, "retention-status.v1.json")),
    readSignal(join(signalsDir, "case-close-status.v1.json")),
    readSignal(join(signalsDir, "appliance-update.v1.json")),
    updateStateDir
      ? readSignal(join(updateStateDir, "update-agent.v2.json"))
      : readSignal(join(signalsDir, "update-agent.v1.json")),
    updateStateDir
      ? readSignal(join(updateStateDir, "update-agent-installation.v1.json"))
      : Promise.resolve(null),
    readSignal(join(updateStateDir ?? signalsDir, "host-observability.v2.json")),
    readSignal(join(updateStateDir ?? signalsDir, "host-os.v1.json")),
  ])
  const backup = parseBackupSignal(backupValue, now)
  const worker = parseWorkerSignal(workerValue, now)
  const retention = parseRetentionSignal(retentionValue, now)
  const caseClose = parseCaseCloseSignal(caseCloseValue, now)
  const update = parseUpdateSignal(updateValue, now)
  const agent = parseUpdateAgentSignal(agentValue, now)
  const agentInstallation = parseUpdateAgentInstallationSignal(agentInstallationValue, now)
  const agentObservation = updateAgentObservation(agent, now, agentInstallation)
  const hostObservations = hostObservabilityObservations(parseHostObservabilitySignal(hostValue, now), now)
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

  // Aged on its own five-minute cadence, not the daily one: the sweep exists to
  // close cases within a thirty-minute window, so a sweep that last ran an hour
  // ago is already not doing its job. Missing is "unknown", as everywhere else
  // here -- a sweep nobody can show evidence for must not read as green.
  const caseCloseAge = caseClose ? now - Date.parse(caseClose.observedAt) : Number.POSITIVE_INFINITY
  let caseCloseStatus: CheckObservation["status"] = "unknown"
  let caseCloseCode = "CASE_CLOSE_SIGNAL_MISSING"
  if (caseClose) {
    if (caseClose.state === "FAILURE") {
      caseCloseStatus = "outage"
      caseCloseCode = caseClose.resultCode
    } else if (caseCloseAge > 60 * 60_000) {
      caseCloseStatus = "outage"
      caseCloseCode = "CASE_CLOSE_OVERDUE"
    } else if (caseCloseAge > 20 * 60_000) {
      caseCloseStatus = "degraded"
      caseCloseCode = "CASE_CLOSE_AGING"
    } else {
      caseCloseStatus = "operational"
      caseCloseCode = "CASE_CLOSE_COMPLETED"
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
      component: "case-close",
      label: "Automatic case closure",
      group: "safety",
      status: caseCloseStatus,
      code: caseCloseCode,
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
    ...hostObservations,
    hostOsObservation(parseHostOsSignal(hostOsValue, now), now),
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
