import "server-only"

import { z } from "zod"
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { logAuditInTransaction } from "@/lib/audit"

const permissionFields = {
  canQuery: z.boolean().default(true),
  canInspectCases: z.boolean().default(false),
  canExportCsv: z.boolean().default(false),
  canExportJson: z.boolean().default(false),
  canExportOmop: z.boolean().default(false),
  canShare: z.boolean().default(false),
}

export const statusResearchGrantSchema = z.object({
  userId: z.string().trim().min(1).max(128),
  institutionId: z.string().trim().min(1).max(128).nullable().optional(),
  allInstitutions: z.boolean().default(false),
  purpose: z.string().trim().min(3).max(500),
  expiryDays: z.number().int().min(1).max(365).default(90),
  supersedesGrantId: z.string().trim().min(1).max(128).nullable().optional(),
  ...permissionFields,
}).strict().superRefine((value, context) => {
  if (value.allInstitutions === Boolean(value.institutionId)) {
    context.addIssue({
      code: "custom",
      message: "Choose one institution or all institutions",
      path: ["institutionId"],
    })
  }
  if (!Object.keys(permissionFields).some(key => value[key as keyof typeof permissionFields])) {
    context.addIssue({ code: "custom", message: "Select at least one permission" })
  }
  if (value.canExportOmop && !value.canExportCsv && !value.canExportJson) {
    context.addIssue({
      code: "custom",
      message: "OMOP also requires CSV or JSON export",
      path: ["canExportOmop"],
    })
  }
  if (value.canShare && !value.canQuery) {
    context.addIssue({
      code: "custom",
      message: "Sharing also requires query access",
      path: ["canShare"],
    })
  }
})

export const statusGrantRevokeSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
}).strict()

export const statusOmopApprovalSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
}).strict()

export class HospitalResearchControlError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = "HospitalResearchControlError"
  }
}

type Database = PrismaClient | Prisma.TransactionClient

async function operatorActor(db: Database) {
  const installation = await db.hospitalInstallation.findUnique({
    where: { id: "local" },
    select: {
      applianceOperator: {
        select: { id: true, role: true, deletedAt: true, emailVerifiedAt: true },
      },
    },
  })
  const actor = installation?.applianceOperator
  if (!actor || actor.role !== "ADMIN" || actor.deletedAt || !actor.emailVerifiedAt) {
    throw new HospitalResearchControlError("APPLIANCE_OPERATOR_UNAVAILABLE")
  }
  return actor
}

export async function listHospitalResearchControl(prisma: PrismaClient) {
  const now = new Date()
  const [accounts, institutions, grants, omopRequests] = await Promise.all([
    prisma.user.findMany({
      where: {
        deletedAt: null,
        emailVerifiedAt: { not: null },
        OR: [
          { accountKind: "RESEARCH_ONLY" },
          { accountKind: "CLINICAL", role: { in: ["MEMBER", "HEAD_OF_DEPT", "ADMIN"] } },
        ],
      },
      select: { id: true, email: true, name: true, institutionId: true, accountKind: true, role: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    prisma.institution.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.researchAccessGrant.findMany({
      include: {
        user: { select: { id: true, email: true, name: true } },
        institution: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.researchExport.findMany({
      where: {
        format: { in: ["omop-csv", "omop-json"] },
        status: "PENDING",
        omopApproval: null,
        researchGrantId: { not: null },
        definitionHash: { not: null },
        snapshotHash: { not: null },
        snapshotCaseCount: { not: null },
      },
      select: {
        id: true,
        ownerId: true,
        owner: { select: { name: true, email: true } },
        name: true,
        format: true,
        purpose: true,
        researchGrantId: true,
        definitionHash: true,
        snapshotHash: true,
        snapshotCaseCount: true,
        scopeInstitutionIds: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
  ])

  return {
    policy: { defaultExpiryDays: 90, maximumExpiryDays: 365 },
    accounts,
    institutions,
    grants: grants.map(grant => ({
      id: grant.id,
      userId: grant.userId,
      userName: grant.user.name,
      userEmail: grant.user.email,
      institutionId: grant.institutionId,
      institutionName: grant.institution?.name ?? null,
      allInstitutions: grant.allInstitutions,
      canQuery: grant.canQuery,
      canInspectCases: grant.canInspectCases,
      canExportCsv: grant.canExportCsv,
      canExportJson: grant.canExportJson,
      canExportOmop: grant.canExportOmop,
      canShare: grant.canShare,
      purposeRecorded: Boolean(grant.purpose),
      expiresAt: grant.expiresAt?.toISOString() ?? null,
      revokedAt: grant.revokedAt?.toISOString() ?? null,
      supersededAt: grant.supersededAt?.toISOString() ?? null,
      supersededById: grant.supersededById,
      active: !grant.revokedAt && !grant.supersededAt
        && Boolean(grant.expiresAt && grant.expiresAt > now),
      createdAt: grant.createdAt.toISOString(),
    })),
    omopRequests: omopRequests.map(record => ({
      id: record.id,
      requesterId: record.ownerId,
      requesterName: record.owner.name,
      requesterEmail: record.owner.email,
      name: record.name,
      purpose: record.purpose,
      format: record.format,
      grantId: record.researchGrantId,
      definitionHash: record.definitionHash,
      snapshotHash: record.snapshotHash,
      snapshotCaseCount: record.snapshotCaseCount,
      scopeInstitutionIds: record.scopeInstitutionIds,
      createdAt: record.createdAt.toISOString(),
    })),
  }
}

export async function issueHospitalResearchGrant(
  prisma: PrismaClient,
  input: z.infer<typeof statusResearchGrantSchema>,
) {
  const parsed = statusResearchGrantSchema.parse(input)
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const target = await tx.user.findUnique({
      where: { id: parsed.userId },
      select: { id: true, role: true, accountKind: true, deletedAt: true, emailVerifiedAt: true },
    })
    if (!target || target.deletedAt) throw new HospitalResearchControlError("RESEARCH_ACCOUNT_NOT_FOUND")
    const eligible = target.accountKind === "RESEARCH_ONLY"
      || (target.accountKind === "CLINICAL"
        && ["MEMBER", "HEAD_OF_DEPT", "ADMIN"].includes(target.role))
    if (!eligible) {
      throw new HospitalResearchControlError("RESEARCH_PRINCIPAL_NOT_ELIGIBLE")
    }
    if (!target.emailVerifiedAt) throw new HospitalResearchControlError("RESEARCH_ACCOUNT_NOT_ACTIVE")
    if (parsed.institutionId) {
      const institution = await tx.institution.findUnique({
        where: { id: parsed.institutionId }, select: { id: true },
      })
      if (!institution) throw new HospitalResearchControlError("INSTITUTION_NOT_FOUND")
    }

    let predecessor: Awaited<ReturnType<typeof tx.researchAccessGrant.findUnique>> = null
    if (parsed.supersedesGrantId) {
      predecessor = await tx.researchAccessGrant.findUnique({
        where: { id: parsed.supersedesGrantId },
      })
      if (!predecessor || predecessor.userId !== parsed.userId) {
        throw new HospitalResearchControlError("GRANT_TO_SUPERSEDE_NOT_FOUND")
      }
      if (predecessor.revokedAt || predecessor.supersededAt) {
        throw new HospitalResearchControlError("GRANT_ALREADY_TERMINAL")
      }
    }

    const createdAt = new Date()
    const grant = await tx.researchAccessGrant.create({
      data: {
        userId: parsed.userId,
        institutionId: parsed.allInstitutions ? null : parsed.institutionId!,
        allInstitutions: parsed.allInstitutions,
        canQuery: parsed.canQuery,
        canInspectCases: parsed.canInspectCases,
        canExport: parsed.canExportCsv || parsed.canExportJson,
        canExportCsv: parsed.canExportCsv,
        canExportJson: parsed.canExportJson,
        canExportOmop: parsed.canExportOmop,
        canShare: parsed.canShare,
        purpose: parsed.purpose,
        grantedById: actor.id,
        expiresAt: new Date(createdAt.getTime() + parsed.expiryDays * 86_400_000),
        createdAt,
      },
    })
    if (predecessor) {
      await tx.researchAccessGrant.update({
        where: { id: predecessor.id },
        data: {
          revokedAt: createdAt,
          supersededAt: createdAt,
          supersededById: grant.id,
        },
      })
    }
    await logAuditInTransaction(tx, actor.id, predecessor
      ? "HOSPITAL_RESEARCH_GRANT_SUPERSEDE"
      : "HOSPITAL_RESEARCH_GRANT_ISSUE", grant.id, {
      targetUserId: grant.userId,
      institutionId: grant.institutionId,
      allInstitutions: grant.allInstitutions,
      permissions: {
        query: grant.canQuery,
        inspect: grant.canInspectCases,
        exportCsv: grant.canExportCsv,
        exportJson: grant.canExportJson,
        exportOmop: grant.canExportOmop,
        share: grant.canShare,
      },
      purposeRecorded: Boolean(grant.purpose),
      expiresAt: grant.expiresAt?.toISOString(),
      supersedesGrantId: predecessor?.id ?? null,
    })
    return grant
  })
}

export async function revokeHospitalResearchGrant(
  prisma: PrismaClient,
  grantId: string,
  reason: string,
) {
  const parsed = statusGrantRevokeSchema.parse({ reason })
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const existing = await tx.researchAccessGrant.findUnique({ where: { id: grantId } })
    if (!existing) throw new HospitalResearchControlError("RESEARCH_GRANT_NOT_FOUND")
    if (existing.revokedAt || existing.supersededAt) {
      throw new HospitalResearchControlError("GRANT_ALREADY_TERMINAL")
    }
    const revoked = await tx.researchAccessGrant.update({
      where: { id: grantId },
      data: { revokedAt: new Date() },
    })
    await logAuditInTransaction(tx, actor.id, "HOSPITAL_RESEARCH_GRANT_REVOKE", grantId, {
      targetUserId: revoked.userId,
      reasonRecorded: Boolean(parsed.reason),
    })
    return revoked
  })
}

export async function approveHospitalOmopExport(
  prisma: PrismaClient,
  exportId: string,
  reason: string,
) {
  const parsed = statusOmopApprovalSchema.parse({ reason })
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const record = await tx.researchExport.findUnique({
      where: { id: exportId },
      include: { omopApproval: true },
    })
    if (!record) throw new HospitalResearchControlError("OMOP_REQUEST_NOT_FOUND")
    if (record.omopApproval) throw new HospitalResearchControlError("OMOP_REQUEST_ALREADY_APPROVED")
    if ((record.format !== "omop-csv" && record.format !== "omop-json")
      || record.status !== "PENDING" || !record.researchGrantId || !record.purpose
      || !record.definitionHash || !record.snapshotHash || record.snapshotCaseCount === null) {
      throw new HospitalResearchControlError("OMOP_REQUEST_NOT_APPROVABLE")
    }
    const grant = await tx.researchAccessGrant.findUnique({
      where: { id: record.researchGrantId },
    })
    const now = new Date()
    const formatAllowed = record.format === "omop-csv"
      ? grant?.canExportCsv
      : grant?.canExportJson
    const scopeAllowed = Boolean(grant?.allInstitutions)
      || (record.scopeInstitutionIds.length === 1
        && record.scopeInstitutionIds[0] === grant?.institutionId)
    if (!grant || grant.userId !== record.ownerId || grant.revokedAt || grant.supersededAt
      || !grant.expiresAt || grant.expiresAt <= now || !grant.canExportOmop
      || !formatAllowed || !scopeAllowed) {
      throw new HospitalResearchControlError("OMOP_GRANT_NOT_ACTIVE")
    }
    const approval = await tx.researchOmopApproval.create({
      data: {
        exportId: record.id,
        grantId: grant.id,
        requesterId: record.ownerId,
        purpose: record.purpose,
        format: record.format,
        definitionHash: record.definitionHash,
        snapshotHash: record.snapshotHash,
        snapshotCaseCount: record.snapshotCaseCount,
        approvedById: actor.id,
        reason: parsed.reason,
      },
    })
    await logAuditInTransaction(tx, actor.id, "HOSPITAL_OMOP_EXPORT_APPROVE", approval.id, {
      exportId: record.id,
      grantId: grant.id,
      requesterId: record.ownerId,
      purposeRecorded: Boolean(record.purpose),
      format: record.format,
      definitionHash: record.definitionHash,
      snapshotHash: record.snapshotHash,
      snapshotCaseCount: record.snapshotCaseCount,
      reasonRecorded: Boolean(parsed.reason),
    })
    return approval
  })
}
