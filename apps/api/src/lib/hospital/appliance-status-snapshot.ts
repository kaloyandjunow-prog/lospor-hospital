import "server-only"

import { createHmac } from "node:crypto"
import { statfs } from "node:fs/promises"
import { resolve } from "node:path"
import { normalizeEmail } from "@lospor/core/account"
import { prisma } from "@/lib/prisma"
import { APPLIANCE_MANIFEST_VERSIONS } from "@/lib/hospital/appliance-versions"
import { isCentralDeliveryConfigured } from "@/lib/hospital/config"
import { countCasesAwaitingCentralExport } from "@/lib/hospital/central-status"

function declaredApplianceRelease(): string {
  const value = process.env.HOSPITAL_APPLIANCE_RELEASE?.trim()
  return value && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(value)
    ? value
    : APPLIANCE_MANIFEST_VERSIONS.hospital
}

type MigrationState = {
  state: "ok" | "failed" | "unknown"
  appliedCount?: number
  failedCount?: number
  latestFinishedAt?: string | null
}

async function migrationState(): Promise<MigrationState> {
  try {
    const [row] = await prisma.$queryRaw<Array<{
      appliedCount: bigint
      failedCount: bigint
      latestFinishedAt: Date | null
    }>>`
      SELECT
        COUNT(*) FILTER (WHERE "finished_at" IS NOT NULL)::bigint AS "appliedCount",
        COUNT(*) FILTER (
          WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL
        )::bigint AS "failedCount",
        MAX("finished_at") AS "latestFinishedAt"
      FROM "_prisma_migrations"
    `
    const failedCount = Number(row?.failedCount ?? 0)
    return {
      state: failedCount > 0 ? "failed" : "ok",
      appliedCount: Number(row?.appliedCount ?? 0),
      failedCount,
      latestFinishedAt: row?.latestFinishedAt?.toISOString() ?? null,
    }
  } catch {
    return { state: "unknown" }
  }
}

async function databaseSize(): Promise<{ state: "known" | "unknown"; bytes?: string }> {
  try {
    const [row] = await prisma.$queryRaw<Array<{ bytes: string }>>`
      SELECT pg_database_size(current_database())::text AS "bytes"
    `
    return row?.bytes ? { state: "known", bytes: row.bytes } : { state: "unknown" }
  } catch {
    return { state: "unknown" }
  }
}

async function researchStorageCapacity(): Promise<{
  driver: "filesystem" | "s3" | "unknown"
  state: "known" | "unknown"
  totalBytes?: string
  availableBytes?: string
}> {
  const configuredDriver = process.env.RESEARCH_EXPORT_STORAGE_DRIVER ?? "filesystem"
  if (configuredDriver === "s3") return { driver: "s3", state: "unknown" }
  if (configuredDriver !== "filesystem") return { driver: "unknown", state: "unknown" }
  try {
    const root = process.env.RESEARCH_EXPORT_STORAGE_DIR
      ?? resolve(process.cwd(), ".data", "research-exports")
    const stats = await statfs(root, { bigint: true })
    return {
      driver: "filesystem",
      state: "known",
      totalBytes: (stats.blocks * stats.bsize).toString(),
      availableBytes: (stats.bavail * stats.bsize).toString(),
    }
  } catch {
    return { driver: "filesystem", state: "unknown" }
  }
}

export async function applianceStatusSnapshot(operatorProofKey: string) {
  const installation = await prisma.hospitalInstallation.findUnique({
    where: { id: "local" },
    select: {
      siteId: true,
      centralEnabled: true,
      institutionId: true,
      enrolledAt: true,
      lastCapabilitiesAt: true,
      lastDeliveryAt: true,
      operatorCredentialGeneration: true,
      applianceOperator: { select: { email: true } },
    },
  })

  const institutionId = installation?.institutionId ?? null
  const [
    policy,
    casesWithUnacceptedChanges,
    deliveryCounts,
    researchCounts,
    migrations,
    logicalDatabaseSize,
    researchStorage,
  ] = await Promise.all([
    institutionId
      ? prisma.centralExportPolicy.findUnique({
          where: { institutionId },
          select: { enabled: true, approvedAt: true },
        })
      : null,
    institutionId ? countCasesAwaitingCentralExport(institutionId) : 0,
    prisma.centralDeliveryBatch.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.researchExport.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    migrationState(),
    databaseSize(),
    researchStorageCapacity(),
  ])

  let centralCredentialsPresent = false
  try {
    centralCredentialsPresent = isCentralDeliveryConfigured()
  } catch {
    // Invalid/missing delivery configuration is a status fact, not a reason to
    // make the otherwise healthy private snapshot unavailable.
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    versions: {
      ...APPLIANCE_MANIFEST_VERSIONS,
      hospital: declaredApplianceRelease(),
    },
    operatorCredentialGeneration: installation?.operatorCredentialGeneration ?? 0,
    operatorCredentialIdentityProof: installation?.applianceOperator?.email
      ? createHmac("sha256", operatorProofKey)
          .update(`operator-email-v1\u0000${normalizeEmail(installation.applianceOperator.email)}`, "utf8")
          .digest("hex")
      : null,
    email: { configured: Boolean(process.env.BREVO_API_KEY) },
    database: { logicalSize: logicalDatabaseSize, migrations },
    research: {
      exportsByStatus: Object.fromEntries(
        researchCounts.map(row => [row.status, row._count._all]),
      ),
      storage: researchStorage,
    },
    central: {
      configured: centralCredentialsPresent,
      enrolled: Boolean(
        installation?.centralEnabled && installation.siteId && institutionId,
      ),
      exportPolicyApproved: Boolean(policy?.enabled && policy.approvedAt),
      casesWithUnacceptedChanges,
      deliveriesByStatus: Object.fromEntries(
        deliveryCounts.map(row => [row.status, row._count._all]),
      ),
      enrolledAt: installation?.enrolledAt?.toISOString() ?? null,
      lastCapabilitiesAt: installation?.lastCapabilitiesAt?.toISOString() ?? null,
      lastDeliveryAt: installation?.lastDeliveryAt?.toISOString() ?? null,
    },
  }
}
