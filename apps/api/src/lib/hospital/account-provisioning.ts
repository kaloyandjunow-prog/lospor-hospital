import "server-only"

import bcrypt from "bcryptjs"
import { z } from "zod"
import type { PrismaClient } from "@/generated/prisma/client"
import { createAuthToken, hashAuthToken, normalizeEmail } from "@/lib/auth-email-tokens"
import { canonicalizeUsername } from "@/lib/username-identity"
import { canHaveHeadOfDepartment } from "@/lib/institutions"
import { notePasswordChanged } from "@/lib/password-epoch"
import { logAuditInTransaction } from "@/lib/audit"
import { HOSPITAL_STATUS_OPERATOR_AUDIT_ID } from "@/lib/hospital/audit-principals"
import {
  claimHospitalUsername,
  UsernameReservationError,
} from "@/lib/hospital/username-reservation"

export const HOSPITAL_ACTIVATION_TTL_MS = 72 * 60 * 60 * 1000
export const HOSPITAL_RECOVERY_TTL_MS = 8 * 60 * 60 * 1000
export const STATUS_OPERATOR_AUDIT_ID = HOSPITAL_STATUS_OPERATOR_AUDIT_ID

export type HospitalAccessProfile =
  | "CLINICAL_MEMBER"
  | "CLINICAL_HOD"
  | "RESEARCH_ONLY"

export const hospitalAccountCreateSchema = z.object({
  username: z.string()
    .min(3)
    .max(64)
    .regex(/^[A-Za-z][A-Za-z0-9._-]*$/),
  email: z.preprocess(
    value => value === undefined || value === "" ? null : value,
    z.string().trim().email().max(254).nullable(),
  ),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  title: z.string().trim().max(40).default(""),
  institutionId: z.string().trim().min(1).max(128),
  accessProfile: z.enum(["CLINICAL_MEMBER", "CLINICAL_HOD", "RESEARCH_ONLY"]),
  locale: z.enum(["bg", "en"]).default("bg"),
}).strict()

export type HospitalAccountCreateInput = z.infer<typeof hospitalAccountCreateSchema>

export type HospitalAccountSummary = {
  id: string
  username: string
  email: string | null
  name: string
  role: string
  accountKind: "CLINICAL" | "RESEARCH_ONLY"
  locale: "bg" | "en"
  institutionId: string | null
  institutionName: string | null
  state: "PENDING_ACTIVATION" | "ACTIVE" | "DELETED"
  designatedApplianceOperator: boolean
  activeActivationExpiresAt: string | null
  activeRecoveryExpiresAt: string | null
  createdAt: string
}

export type HospitalInstitutionSummary = {
  id: string
  name: string
  city: string
  canHaveHeadOfDepartment: boolean
}

export class HospitalAccountError extends Error {
  constructor(
    public readonly code: string,
    message = code,
  ) {
    super(message)
    this.name = "HospitalAccountError"
  }
}

type ClockAndToken = {
  now?: Date
  tokenFactory?: () => string
}

function expiresAt(now: Date, ttlMs: number): Date {
  return new Date(now.getTime() + ttlMs)
}

function accessFields(profile: HospitalAccessProfile): {
  role: "MEMBER" | "HEAD_OF_DEPT" | "RESEARCHER"
  accountKind: "CLINICAL" | "RESEARCH_ONLY"
} {
  if (profile === "CLINICAL_HOD") {
    return { role: "HEAD_OF_DEPT", accountKind: "CLINICAL" }
  }
  if (profile === "RESEARCH_ONLY") {
    // The pinned Hospital API still keys research grants on the legacy role.
    // AccountKind is nevertheless written now and is the durable authority;
    // the role compatibility value can be normalized when the staged shared
    // 1.2.0 identity import is deliberately advanced.
    return { role: "RESEARCHER", accountKind: "RESEARCH_ONLY" }
  }
  return { role: "MEMBER", accountKind: "CLINICAL" }
}

function hasStatusManagedAuthority(user: { role: string; accountKind: string }): boolean {
  return user.accountKind === "CLINICAL"
    ? user.role === "MEMBER" || user.role === "HEAD_OF_DEPT"
    : user.accountKind === "RESEARCH_ONLY" && user.role === "RESEARCHER"
}

function localeFromPreferences(value: unknown): "bg" | "en" {
  if (!value || typeof value !== "object") return "bg"
  const ui = (value as { ui?: unknown }).ui
  if (!ui || typeof ui !== "object") return "bg"
  return (ui as { locale?: unknown }).locale === "en" ? "en" : "bg"
}

function requiredStoredUsername(value: string | null): string {
  if (!value || !/^[A-Za-z][A-Za-z0-9._-]{2,63}$/.test(value)) {
    throw new HospitalAccountError("ACCOUNT_USERNAME_MISSING")
  }
  return value
}

function translateUniqueError(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    const target = "meta" in error
      && error.meta
      && typeof error.meta === "object"
      && "target" in error.meta
      && Array.isArray(error.meta.target)
      ? error.meta.target
      : []
    throw new HospitalAccountError(
      target.includes("email") ? "EMAIL_ALREADY_REGISTERED" : "USERNAME_ALREADY_REGISTERED",
    )
  }
  throw error
}

export async function createHospitalAccount(
  prisma: PrismaClient,
  rawInput: HospitalAccountCreateInput,
  options: ClockAndToken = {},
) {
  const input = hospitalAccountCreateSchema.parse(rawInput)
  const now = options.now ?? new Date()
  const token = (options.tokenFactory ?? createAuthToken)()
  const activationExpiresAt = expiresAt(now, HOSPITAL_ACTIVATION_TTL_MS)
  const usernameCanonical = canonicalizeUsername(input.username)
  const email = input.email === null ? null : normalizeEmail(input.email)
  const access = accessFields(input.accessProfile)

  // Hashing belongs outside the database transaction. The temporary password
  // is never returned or persisted in plaintext and cannot be used by anyone;
  // activation replaces this verifier before the account can sign in.
  const inaccessiblePasswordHash = await bcrypt.hash(createAuthToken(), 12)

  try {
    return await prisma.$transaction(async tx => {
      const institution = await tx.institution.findUnique({
        where: { id: input.institutionId },
        select: { id: true, name: true },
      })
      if (!institution) throw new HospitalAccountError("INSTITUTION_NOT_FOUND")
      if (input.accessProfile === "CLINICAL_HOD" && !canHaveHeadOfDepartment(institution.id)) {
        throw new HospitalAccountError("INSTITUTION_CANNOT_HAVE_HOD")
      }

      const existingUsername = await tx.user.findUnique({
        where: { usernameCanonical },
        select: { id: true },
      })
      if (existingUsername) throw new HospitalAccountError("USERNAME_ALREADY_REGISTERED")
      if (email !== null) {
        const existingEmail = await tx.user.findUnique({
          where: { email },
          select: { id: true },
        })
        if (existingEmail) throw new HospitalAccountError("EMAIL_ALREADY_REGISTERED")
      }

      const user = await tx.user.create({
        data: {
          email,
          username: input.username,
          usernameCanonical,
          firstName: input.firstName,
          lastName: input.lastName,
          title: input.title,
          name: [input.title, input.firstName, input.lastName].filter(Boolean).join(" "),
          passwordHash: inaccessiblePasswordHash,
          role: access.role,
          accountKind: access.accountKind,
          institutionId: institution.id,
          approvedAt: now,
          activatedAt: null,
          emailVerifiedAt: null,
          preferences: { ui: { locale: input.locale } },
        },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          accountKind: true,
          institutionId: true,
          createdAt: true,
        },
      })
      await claimHospitalUsername(tx, user.id, usernameCanonical, now)

      await tx.hospitalAccountAccessToken.create({
        data: {
          userId: user.id,
          purpose: "ACTIVATION",
          tokenHash: hashAuthToken(token),
          expiresAt: activationExpiresAt,
          createdAt: now,
        },
      })
      await logAuditInTransaction(tx, STATUS_OPERATOR_AUDIT_ID, "HOSPITAL_ACCOUNT_CREATED", user.id, {
        role: user.role,
        accountKind: user.accountKind,
        institutionId: user.institutionId,
        locale: input.locale,
      })
      await logAuditInTransaction(tx, STATUS_OPERATOR_AUDIT_ID, "HOSPITAL_ACCOUNT_ACTIVATION_ISSUED", user.id, {
        expiresAt: activationExpiresAt.toISOString(),
      })

      return { user, institution, token, expiresAt: activationExpiresAt }
    })
  } catch (error) {
    if (error instanceof HospitalAccountError) throw error
    if (error instanceof UsernameReservationError) {
      throw new HospitalAccountError(error.code)
    }
    translateUniqueError(error)
  }
}

export async function listHospitalAccounts(
  prisma: PrismaClient,
  now = new Date(),
): Promise<{ accounts: HospitalAccountSummary[]; institutions: HospitalInstitutionSummary[] }> {
  const [users, institutions, installation] = await Promise.all([
    prisma.user.findMany({
      take: 500,
      orderBy: [{ deletedAt: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        accountKind: true,
        institutionId: true,
        institution: { select: { name: true } },
        preferences: true,
        activatedAt: true,
        deletedAt: true,
        createdAt: true,
        hospitalAccountTokens: {
          where: {
            consumedAt: null,
            invalidatedAt: null,
            expiresAt: { gt: now },
          },
          select: { purpose: true, expiresAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.institution.findMany({
      select: { id: true, name: true, city: true },
      orderBy: [{ name: "asc" }, { city: "asc" }],
    }),
    prisma.hospitalInstallation.findUnique({
      where: { id: "local" },
      select: { applianceOperatorUserId: true },
    }),
  ])

  return {
    accounts: users.map(user => {
      const activation = user.hospitalAccountTokens.find(token => token.purpose === "ACTIVATION")
      const recovery = user.hospitalAccountTokens.find(token => token.purpose === "RECOVERY")
      return {
        id: user.id,
        username: requiredStoredUsername(user.username),
        email: user.email,
        name: user.name,
        role: user.role,
        accountKind: user.accountKind,
        locale: localeFromPreferences(user.preferences),
        institutionId: user.institutionId,
        institutionName: user.institution?.name ?? null,
        state: user.deletedAt
          ? "DELETED"
          : user.activatedAt
            ? "ACTIVE"
            : "PENDING_ACTIVATION",
        designatedApplianceOperator: installation?.applianceOperatorUserId === user.id,
        activeActivationExpiresAt: activation?.expiresAt.toISOString() ?? null,
        activeRecoveryExpiresAt: recovery?.expiresAt.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      }
    }),
    institutions: institutions.map(institution => ({
      ...institution,
      canHaveHeadOfDepartment: canHaveHeadOfDepartment(institution.id),
    })),
  }
}

async function issueHospitalAccountToken(
  prisma: PrismaClient,
  userId: string,
  purpose: "ACTIVATION" | "RECOVERY",
  ttlMs: number,
  options: ClockAndToken = {},
) {
  const now = options.now ?? new Date()
  const token = (options.tokenFactory ?? createAuthToken)()
  const expiry = expiresAt(now, ttlMs)

  return prisma.$transaction(async tx => {
    // Serialize link issuance for one account. If two operators reissue at
    // once, the later transaction sees and invalidates the earlier link, so
    // there is still exactly one active link when both requests finish.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        accountKind: true,
        activatedAt: true,
        deletedAt: true,
      },
    })
    if (!user || user.deletedAt) throw new HospitalAccountError("ACCOUNT_NOT_FOUND")
    if (!hasStatusManagedAuthority(user)) {
      throw new HospitalAccountError("ACCOUNT_AUTHORITY_PROTECTED")
    }
    if (purpose === "ACTIVATION" && user.activatedAt) {
      throw new HospitalAccountError("ACCOUNT_ALREADY_ACTIVE")
    }
    if (purpose === "RECOVERY" && !user.activatedAt) {
      throw new HospitalAccountError("ACCOUNT_NOT_ACTIVE")
    }
    const designated = await tx.hospitalInstallation.findFirst({
      where: { applianceOperatorUserId: user.id },
      select: { id: true },
    })
    if (designated) throw new HospitalAccountError("APPLIANCE_OPERATOR_MANAGED")

    const invalidated = await tx.hospitalAccountAccessToken.updateMany({
      where: {
        userId: user.id,
        purpose,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: now },
    })
    await tx.hospitalAccountAccessToken.create({
      data: {
        userId: user.id,
        purpose,
        tokenHash: hashAuthToken(token),
        expiresAt: expiry,
        createdAt: now,
      },
    })
    await logAuditInTransaction(
      tx,
      STATUS_OPERATOR_AUDIT_ID,
      purpose === "ACTIVATION"
        ? "HOSPITAL_ACCOUNT_ACTIVATION_REISSUED"
        : "HOSPITAL_ACCOUNT_RECOVERY_ISSUED",
      user.id,
      {
        // The URL, token, and token hash are intentionally absent.
        expiresAt: expiry.toISOString(),
        priorLinksInvalidated: invalidated.count,
      },
    )
    return { token, expiresAt: expiry }
  })
}

export function reissueHospitalActivation(
  prisma: PrismaClient,
  userId: string,
  options: ClockAndToken = {},
) {
  return issueHospitalAccountToken(
    prisma,
    userId,
    "ACTIVATION",
    HOSPITAL_ACTIVATION_TTL_MS,
    options,
  )
}

export function issueHospitalRecovery(
  prisma: PrismaClient,
  userId: string,
  options: ClockAndToken = {},
) {
  return issueHospitalAccountToken(
    prisma,
    userId,
    "RECOVERY",
    HOSPITAL_RECOVERY_TTL_MS,
    options,
  )
}

export type HospitalTokenConsumeResult =
  | { matched: false }
  | { matched: true; purpose: "ACTIVATION" | "RECOVERY"; userId: string }

/**
 * Atomically claim and consume a Hospital activation/recovery token.
 *
 * The conditional update is the arbiter. Two requests may both read the row,
 * but only one can change it while it is active; the losing transaction rolls
 * back before changing the password or writing a misleading audit row.
 */
export async function consumeHospitalAccountToken(
  prisma: PrismaClient,
  token: string,
  password: string,
  now = new Date(),
): Promise<HospitalTokenConsumeResult> {
  if (token.length < 32 || token.length > 256) return { matched: false }
  const tokenHash = hashAuthToken(token)

  // Reject random traffic before doing an expensive bcrypt operation. The
  // row is re-read and conditionally claimed in the transaction below, so
  // this preflight is only a denial-of-service guard, never the consume arbiter.
  const candidate = await prisma.hospitalAccountAccessToken.findUnique({
    where: { tokenHash },
    select: { id: true },
  })
  if (!candidate) return { matched: false }

  const passwordHash = await bcrypt.hash(password, 12)

  const result = await prisma.$transaction(async tx => {
    const candidateRecord = await tx.hospitalAccountAccessToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    })
    if (!candidateRecord) return { matched: false } as const

    // Use the same per-user row lock as issuance, then re-read under that lock.
    // This prevents a simultaneous reissue from leaving both callers believing
    // they own a usable link.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${candidateRecord.userId} FOR UPDATE`
    const record = await tx.hospitalAccountAccessToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    })
    if (!record) return { matched: false } as const
    if (
      record.consumedAt
      || record.invalidatedAt
      || record.expiresAt <= now
      || record.user.deletedAt
    ) {
      throw new HospitalAccountError("INVALID_OR_EXPIRED_ACCOUNT_LINK")
    }
    if (!hasStatusManagedAuthority(record.user)) {
      throw new HospitalAccountError("ACCOUNT_AUTHORITY_PROTECTED")
    }
    if (record.purpose === "ACTIVATION" && record.user.activatedAt) {
      throw new HospitalAccountError("INVALID_OR_EXPIRED_ACCOUNT_LINK")
    }
    if (record.purpose === "RECOVERY" && !record.user.activatedAt) {
      throw new HospitalAccountError("INVALID_OR_EXPIRED_ACCOUNT_LINK")
    }
    const designated = await tx.hospitalInstallation.findFirst({
      where: { applianceOperatorUserId: record.userId },
      select: { id: true },
    })
    if (designated) throw new HospitalAccountError("APPLIANCE_OPERATOR_MANAGED")

    const claimed = await tx.hospitalAccountAccessToken.updateMany({
      where: {
        id: record.id,
        consumedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    })
    if (claimed.count !== 1) {
      throw new HospitalAccountError("INVALID_OR_EXPIRED_ACCOUNT_LINK")
    }

    await tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        passwordChangedAt: now,
        ...(record.purpose === "ACTIVATION" ? { activatedAt: now } : {}),
      },
    })
    await tx.hospitalAccountAccessToken.updateMany({
      where: {
        userId: record.userId,
        purpose: record.purpose,
        id: { not: record.id },
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: now },
    })
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: now },
    })
    await logAuditInTransaction(
      tx,
      record.userId,
      record.purpose === "ACTIVATION"
        ? "HOSPITAL_ACCOUNT_ACTIVATED"
        : "HOSPITAL_ACCOUNT_RECOVERY_CONSUMED",
      record.userId,
      { linkPurposeCode: record.purpose },
    )

    return { matched: true, purpose: record.purpose, userId: record.userId } as const
  })

  if (result.matched) notePasswordChanged(result.userId, now)
  return result
}
