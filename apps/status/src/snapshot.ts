import type { ApplianceSnapshot, CheckObservation } from "./types.js"
import { finiteInteger, hasExactKeys, isRecord, validIsoDate } from "./util.js"

const RESEARCH_STATUSES = ["PENDING", "RUNNING", "COMPLETE", "FAILED"] as const
const CENTRAL_STATUSES = [
  "PENDING", "GENERATING", "READY", "UPLOADING", "AWAITING_RECEIPT",
  "ACCEPTED", "REJECTED", "RETRY", "CANCELLED",
] as const

function nullableDate(value: unknown): value is string | null {
  return value === null || validIsoDate(value)
}

function byteString(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,30}$/.test(value)
}

function version(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(value)
}

function countMap(value: unknown, allowed: readonly string[]): Record<string, number> | null {
  if (!isRecord(value) || Object.keys(value).some(key => !allowed.includes(key))) return null
  const result: Record<string, number> = {}
  for (const [key, count] of Object.entries(value)) {
    if (!finiteInteger(count, 0, 1_000_000_000)) return null
    result[key] = count
  }
  return result
}

export function parseApplianceSnapshot(value: unknown): ApplianceSnapshot | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "generatedAt", "versions", "operatorCredentialGeneration",
    "operatorCredentialIdentityProof", "email", "database", "research", "central",
  ])) return null
  if (value.schemaVersion !== 1 || !validIsoDate(value.generatedAt)
    || !finiteInteger(value.operatorCredentialGeneration, 0, 1_000_000)
    || (value.operatorCredentialIdentityProof !== null
      && (typeof value.operatorCredentialIdentityProof !== "string"
        || !/^[0-9a-f]{64}$/.test(value.operatorCredentialIdentityProof)))) return null
  if (!isRecord(value.versions) || !hasExactKeys(
    value.versions,
    ["hospital", "api", "core", "databaseSchema"],
  ) || Object.values(value.versions).some(item => !version(item))) return null
  if (!isRecord(value.email) || !hasExactKeys(value.email, ["configured"])
    || typeof value.email.configured !== "boolean") return null
  if (!isRecord(value.database) || !hasExactKeys(value.database, ["logicalSize", "migrations"])
    || !isRecord(value.database.logicalSize)
    || !hasExactKeys(value.database.logicalSize, ["state"], ["bytes"])
    || !["known", "unknown"].includes(String(value.database.logicalSize.state))
    || (value.database.logicalSize.state === "known" && !byteString(value.database.logicalSize.bytes))
    || (value.database.logicalSize.bytes !== undefined && !byteString(value.database.logicalSize.bytes))) return null
  const migrations = value.database.migrations
  if (!isRecord(migrations)
    || !hasExactKeys(migrations, ["state"], ["appliedCount", "failedCount", "latestFinishedAt"])
    || !["ok", "failed", "unknown"].includes(String(migrations.state))
    || (migrations.appliedCount !== undefined && !finiteInteger(migrations.appliedCount, 0, 1_000_000))
    || (migrations.failedCount !== undefined && !finiteInteger(migrations.failedCount, 0, 1_000_000))
    || (migrations.latestFinishedAt !== undefined && !nullableDate(migrations.latestFinishedAt))) return null
  if (!isRecord(value.research) || !hasExactKeys(value.research, ["exportsByStatus", "storage"])) return null
  const researchCounts = countMap(value.research.exportsByStatus, RESEARCH_STATUSES)
  const storage = value.research.storage
  if (!researchCounts || !isRecord(storage)
    || !hasExactKeys(storage, ["driver", "state"], ["totalBytes", "availableBytes"])
    || !["filesystem", "s3", "unknown"].includes(String(storage.driver))
    || !["known", "unknown"].includes(String(storage.state))
    || (storage.totalBytes !== undefined && !byteString(storage.totalBytes))
    || (storage.availableBytes !== undefined && !byteString(storage.availableBytes))) return null
  const central = value.central
  if (!isRecord(central) || !hasExactKeys(central, [
    "configured", "enrolled", "exportPolicyApproved", "casesWithUnacceptedChanges",
    "deliveriesByStatus", "enrolledAt", "lastCapabilitiesAt", "lastDeliveryAt",
  ]) || typeof central.configured !== "boolean" || typeof central.enrolled !== "boolean"
    || typeof central.exportPolicyApproved !== "boolean"
    || !finiteInteger(central.casesWithUnacceptedChanges, 0, 1_000_000_000)
    || !nullableDate(central.enrolledAt) || !nullableDate(central.lastCapabilitiesAt)
    || !nullableDate(central.lastDeliveryAt)) return null
  const deliveryCounts = countMap(central.deliveriesByStatus, CENTRAL_STATUSES)
  if (!deliveryCounts) return null

  return {
    schemaVersion: 1,
    generatedAt: value.generatedAt,
    versions: {
      hospital: value.versions.hospital as string,
      api: value.versions.api as string,
      core: value.versions.core as string,
      databaseSchema: value.versions.databaseSchema as string,
    },
    operatorCredentialGeneration: value.operatorCredentialGeneration,
    operatorCredentialIdentityProof: value.operatorCredentialIdentityProof as string | null,
    email: { configured: value.email.configured },
    database: {
      logicalSize: {
        state: value.database.logicalSize.state as "known" | "unknown",
        ...(value.database.logicalSize.bytes === undefined ? {} : { bytes: value.database.logicalSize.bytes as string }),
      },
      migrations: {
        state: migrations.state as "ok" | "failed" | "unknown",
        ...(migrations.appliedCount === undefined ? {} : { appliedCount: migrations.appliedCount as number }),
        ...(migrations.failedCount === undefined ? {} : { failedCount: migrations.failedCount as number }),
        ...(migrations.latestFinishedAt === undefined
          ? {}
          : { latestFinishedAt: migrations.latestFinishedAt as string | null }),
      },
    },
    research: {
      exportsByStatus: researchCounts,
      storage: {
        driver: storage.driver as "filesystem" | "s3" | "unknown",
        state: storage.state as "known" | "unknown",
        ...(storage.totalBytes === undefined ? {} : { totalBytes: storage.totalBytes as string }),
        ...(storage.availableBytes === undefined ? {} : { availableBytes: storage.availableBytes as string }),
      },
    },
    central: {
      configured: central.configured,
      enrolled: central.enrolled,
      exportPolicyApproved: central.exportPolicyApproved,
      casesWithUnacceptedChanges: central.casesWithUnacceptedChanges,
      deliveriesByStatus: deliveryCounts,
      enrolledAt: central.enrolledAt,
      lastCapabilitiesAt: central.lastCapabilitiesAt,
      lastDeliveryAt: central.lastDeliveryAt,
    },
  }
}

export function snapshotIsFresh(snapshot: ApplianceSnapshot, now = Date.now()): boolean {
  const generatedAt = Date.parse(snapshot.generatedAt)
  return generatedAt >= now - 5 * 60_000 && generatedAt <= now + 5 * 60_000
}

export function snapshotObservations(snapshot: ApplianceSnapshot, now = Date.now()): CheckObservation[] {
  const migrations = snapshot.database.migrations.state
  const storage = snapshot.research.storage
  const total = storage.totalBytes ? Number(storage.totalBytes) : 0
  const available = storage.availableBytes ? Number(storage.availableBytes) : 0
  const usedPercent = total > 0 ? ((total - available) / total) * 100 : null
  const storageStatus = storage.state !== "known" || usedPercent === null
    ? "unknown"
    : usedPercent >= 95
      ? "outage"
      : usedPercent >= 85
        ? "degraded"
        : "operational"
  const centralStatus = !snapshot.central.configured
    ? "not-configured"
    : !snapshot.central.enrolled || !snapshot.central.exportPolicyApproved
      ? "degraded"
      : "operational"
  const failedExports = snapshot.research.exportsByStatus.FAILED ?? 0
  return [
    {
      component: "migrations", label: "Database migrations", group: "safety",
      status: migrations === "ok" ? "operational" : migrations === "failed" ? "outage" : "unknown",
      code: migrations === "ok" ? "MIGRATIONS_CURRENT" : migrations === "failed" ? "MIGRATIONS_FAILED" : "MIGRATIONS_UNKNOWN",
      checkedAt: now,
    },
    {
      component: "research-storage", label: "Research export storage", group: "safety",
      status: storageStatus,
      code: storageStatus === "operational" ? "STORAGE_CAPACITY_OK"
        : storageStatus === "degraded" ? "STORAGE_CAPACITY_LOW"
          : storageStatus === "outage" ? "STORAGE_CAPACITY_CRITICAL" : "STORAGE_CAPACITY_UNKNOWN",
      checkedAt: now,
    },
    {
      component: "email", label: "Appliance email", group: "safety",
      status: snapshot.email.configured ? "operational" : "not-configured",
      code: snapshot.email.configured ? "EMAIL_CONFIGURED" : "EMAIL_NOT_CONFIGURED",
      checkedAt: now,
    },
    {
      component: "central", label: "Central delivery", group: "research",
      status: centralStatus,
      code: centralStatus === "not-configured" ? "CENTRAL_NOT_CONFIGURED"
        : centralStatus === "degraded" ? "CENTRAL_ENROLMENT_INCOMPLETE" : "CENTRAL_READY",
      checkedAt: now,
    },
    {
      component: "research-exports", label: "Research exports", group: "research",
      status: failedExports > 0 ? "degraded" : "operational",
      code: failedExports > 0 ? "RESEARCH_EXPORTS_FAILED" : "RESEARCH_EXPORTS_OK",
      checkedAt: now,
    },
  ]
}
