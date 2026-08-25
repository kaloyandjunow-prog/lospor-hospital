import "server-only"

import { z } from "zod"
import type { PrismaClient } from "@/generated/prisma/client"
import { createAuthToken, hashAuthToken } from "@/lib/auth-email-tokens"
import { validateAndNormalizeUsername } from "@/lib/username-identity"
import { canHaveHeadOfDepartment } from "@/lib/institutions"
import { logAuditInTransaction } from "@/lib/audit"
import { invalidateAccountState, notePasswordChanged } from "@/lib/password-epoch"
import {
  HOSPITAL_RECOVERY_TTL_MS,
  HospitalAccountError,
  STATUS_OPERATOR_AUDIT_ID,
} from "@/lib/hospital/account-provisioning"
import {
  claimOrRetainHospitalUsername,
  UsernameReservationError,
} from "@/lib/hospital/username-reservation"

export const hospitalClinicalRoleChangeSchema = z.object({
  role: z.enum(["MEMBER", "HEAD_OF_DEPT", "ADMIN"]),
  reason: z.string().trim().min(10).max(1000),
}).strict()

export type HospitalClinicalRoleChangeInput = z.infer<typeof hospitalClinicalRoleChangeSchema>

export const hospitalUsernameRenameSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[A-Za-z][A-Za-z0-9._-]*$/),
  reason: z.string().trim().min(10).max(1000),
}).strict()

const CLINICAL_ROLES = new Set(["MEMBER", "HEAD_OF_DEPT", "ADMIN"])

/** Status-only clinical authority mutation, serialized across all Admin changes. */
export async function changeHospitalClinicalRole(
  prisma: PrismaClient,
  userId: string,
  rawInput: HospitalClinicalRoleChangeInput,
  now = new Date(),
) {
  const input = hospitalClinicalRoleChangeSchema.parse(rawInput)
  const result = await prisma.$transaction(async tx => {
    // Different target rows are insufficient to prevent two concurrent Admins
    // from demoting one another after both observe an Admin count of two.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(1280261967)`
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true, role: true, accountKind: true, institutionId: true,
        activatedAt: true, deletedAt: true,
      },
    })
    if (!user || user.deletedAt) throw new HospitalAccountError("ACCOUNT_NOT_FOUND")
    if (user.accountKind !== "CLINICAL" || !CLINICAL_ROLES.has(user.role)) {
      throw new HospitalAccountError("ACCOUNT_AUTHORITY_PROTECTED")
    }
    if (user.role === input.role) {
      return { account: { id: user.id, role: user.role }, previousRole: user.role, changed: false, invalidatedLinks: 0 }
    }
    // Create as Member/HOD, activate, then promote. No route provisions a
    // chosen-password or direct ADMIN account.
    if (input.role === "ADMIN" && !user.activatedAt) {
      throw new HospitalAccountError("ACCOUNT_NOT_ACTIVE")
    }
    if (input.role === "HEAD_OF_DEPT" && !canHaveHeadOfDepartment(user.institutionId)) {
      throw new HospitalAccountError("INSTITUTION_CANNOT_HAVE_HOD")
    }
    if (user.role === "ADMIN" && input.role !== "ADMIN") {
      const designated = await tx.hospitalInstallation.findFirst({
        where: { applianceOperatorUserId: user.id },
        select: { id: true },
      })
      if (designated) throw new HospitalAccountError("APPLIANCE_OPERATOR_MANAGED")
      const activeClinicalAdmins = await tx.user.count({
        where: {
          role: "ADMIN",
          accountKind: "CLINICAL",
          activatedAt: { not: null },
          deletedAt: null,
        },
      })
      if (activeClinicalAdmins <= 1) throw new HospitalAccountError("LAST_CLINICAL_ADMIN")
    }

    const invalidatedLinks = await tx.hospitalAccountAccessToken.updateMany({
      where: { userId: user.id, consumedAt: null, invalidatedAt: null },
      data: { invalidatedAt: now },
    })
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    })
    const changed = await tx.user.update({
      where: { id: user.id },
      data: { role: input.role, passwordChangedAt: now },
      select: { id: true, role: true },
    })
    await logAuditInTransaction(tx, STATUS_OPERATOR_AUDIT_ID, "ADMIN_ACCOUNT_AUTHORITY_CHANGE", user.id, {
      previousRole: user.role,
      role: changed.role,
      changedFields: ["role"],
      reasonRecorded: true,
      sessionsRevoked: true,
      accountLinksInvalidated: invalidatedLinks.count,
    })
    return { account: changed, previousRole: user.role, changed: true, invalidatedLinks: invalidatedLinks.count }
  })

  if (result.changed) {
    notePasswordChanged(userId, now)
    invalidateAccountState(userId)
  }
  return result
}

/** Status-only rename. It keeps every historical name reserved and issues a fresh recovery link. */
export async function renameHospitalUsername(
  prisma: PrismaClient,
  userId: string,
  rawInput: z.infer<typeof hospitalUsernameRenameSchema>,
  now = new Date(),
  tokenFactory: () => string = createAuthToken,
) {
  const input = hospitalUsernameRenameSchema.parse(rawInput)
  const normalized = validateAndNormalizeUsername(input.username)
  if (!normalized.success) throw new HospitalAccountError(normalized.code)
  const token = tokenFactory()
  const expiresAt = new Date(now.getTime() + HOSPITAL_RECOVERY_TTL_MS)
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, usernameCanonical: true, activatedAt: true, deletedAt: true },
      })
      if (!user || user.deletedAt) throw new HospitalAccountError("ACCOUNT_NOT_FOUND")
      if (!user.activatedAt) throw new HospitalAccountError("ACCOUNT_NOT_ACTIVE")
      const designated = await tx.hospitalInstallation.findFirst({
        where: { applianceOperatorUserId: user.id },
        select: { id: true },
      })
      if (designated) throw new HospitalAccountError("APPLIANCE_OPERATOR_MANAGED")

      await claimOrRetainHospitalUsername(tx, user.id, normalized.value.usernameCanonical, now)
      const invalidated = await tx.hospitalAccountAccessToken.updateMany({
        where: { userId: user.id, consumedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now },
      })
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      })
      const account = await tx.user.update({
        where: { id: user.id },
        data: {
          username: normalized.value.username,
          usernameCanonical: normalized.value.usernameCanonical,
          passwordChangedAt: now,
        },
        select: { id: true, username: true },
      })
      await tx.hospitalAccountAccessToken.create({
        data: {
          userId: user.id,
          purpose: "RECOVERY",
          tokenHash: hashAuthToken(token),
          expiresAt,
          createdAt: now,
        },
      })
      await logAuditInTransaction(tx, STATUS_OPERATOR_AUDIT_ID, "HOSPITAL_ACCOUNT_USERNAME_CHANGED", user.id, {
        changedFields: ["username"],
        reasonRecorded: true,
        sessionsRevoked: true,
        accountLinksInvalidated: invalidated.count,
        recoveryIssued: true,
      })
      return { account }
    })
    notePasswordChanged(userId, now)
    invalidateAccountState(userId)
    return { ...result, token, expiresAt }
  } catch (error) {
    if (error instanceof UsernameReservationError) {
      throw new HospitalAccountError(error.code)
    }
    throw error
  }
}
