import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "./deployment"

type Database = PrismaClient | Prisma.TransactionClient

export type CaseVisibilityControlView = {
  enabled: boolean
  changeReasonRecorded: boolean
  changedAt: string | null
  updatedAt: string | null
}

/**
 * Hospital-wide case reading is deliberately on for a fresh appliance. The
 * Status control is the durable override; this environment value is only the
 * install-time default before the singleton policy row exists.
 */
export function configuredCaseVisibilityDefault(): boolean {
  const value = process.env.HOSPITAL_CASE_VISIBILITY_DEFAULT?.trim().toLowerCase()
  return value !== "false" && value !== "no" && value !== "0"
}

export function isClinicalCaseViewer(user: { role?: string | null; accountKind?: string | null }): boolean {
  return (user.role === "MEMBER" || user.role === "HEAD_OF_DEPT" || user.role === "ADMIN")
    && user.accountKind !== "RESEARCH_ONLY"
}

export function isHospitalWideCaseViewer(
  user: { role?: string | null; accountKind?: string | null; institutionId?: string | null },
  enabled: boolean,
): boolean {
  return isHospitalDeployment()
    && enabled
    && isClinicalCaseViewer(user)
    && !!user.institutionId
}

export async function caseVisibilityCapabilityState(
  db: Database = prisma,
): Promise<{ enabled: boolean }> {
  if (!isHospitalDeployment()) return { enabled: false }
  const policy = await db.hospitalCaseVisibilityPolicy.findUnique({
    where: { id: "local" },
    select: { enabled: true },
  })
  return { enabled: policy?.enabled ?? configuredCaseVisibilityDefault() }
}

export async function caseVisibilityControlView(
  db: Database = prisma,
): Promise<CaseVisibilityControlView> {
  const policy = await db.hospitalCaseVisibilityPolicy.findUnique({ where: { id: "local" } })
  return {
    enabled: policy?.enabled ?? configuredCaseVisibilityDefault(),
    changeReasonRecorded: Boolean(policy?.changeReason),
    changedAt: policy?.changedAt?.toISOString() ?? null,
    updatedAt: policy?.updatedAt?.toISOString() ?? null,
  }
}
