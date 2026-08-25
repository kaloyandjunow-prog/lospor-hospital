import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { hashAuthToken } from "@/lib/auth-email-tokens"
import { notePasswordChanged } from "@/lib/password-epoch"
import { passwordSchema } from "@/lib/password-policy"
import { revokeAllSessionsInTransaction } from "@/lib/auth-sessions"
import { logAuditInTransaction } from "@/lib/audit"
import {
  APPLIANCE_OPERATOR_MANAGED_MESSAGE,
  isDesignatedApplianceOperator,
} from "@/lib/hospital/appliance-operator"
import { applianceOperatorBlocksMutation } from "@/lib/hospital/appliance-operator-guard"
import { isHospitalDeployment } from "@/lib/hospital/deployment"
import {
  consumeHospitalAccountToken,
  HospitalAccountError,
} from "@/lib/hospital/account-provisioning"

const schema = z.object({
  token: z.string().min(20),
  password: passwordSchema,
})

class ResetClaimFailed extends Error {}

export async function POST(req: NextRequest) {
  let data: z.infer<typeof schema>
  try {
    data = schema.parse(await req.json())
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request"
    return NextResponse.json({ error: message ?? "Invalid request" }, { status: 400 })
  }

  const now = new Date()
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashAuthToken(data.token) },
    include: { user: true },
  })

  // A Hospital operator-issued token never populates passwordResetToken --
  // its secret lives in the URL fragment, which never reaches this server as
  // a query token. Fall through to it only once the standard lookup misses.
  if (!resetToken && isHospitalDeployment()) {
    try {
      const hospitalToken = await consumeHospitalAccountToken(
        prisma,
        data.token,
        data.password,
        now,
      )
      if (hospitalToken.matched) {
        return NextResponse.json({ ok: true, purpose: hospitalToken.purpose })
      }
    } catch (error) {
      if (error instanceof HospitalAccountError) {
        const operatorManaged = error.code === "APPLIANCE_OPERATOR_MANAGED"
        return NextResponse.json({
          error: operatorManaged
            ? APPLIANCE_OPERATOR_MANAGED_MESSAGE
            : "Invalid or expired account link",
          code: error.code,
        }, { status: operatorManaged ? 409 : 400 })
      }
      return NextResponse.json({ error: "Account link could not be used" }, { status: 500 })
    }
  }

  if (
    !resetToken
    || resetToken.usedAt
    || resetToken.expiresAt < now
    || resetToken.user.deletedAt
    || resetToken.user.anonymizedAt
  ) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 })
  }
  // Also guard tokens issued before an administrator became the appliance
  // operator. A stale reset link must not be able to desynchronise Status.
  if (applianceOperatorBlocksMutation(
    await isDesignatedApplianceOperator(resetToken.userId),
    "PASSWORD_RESET",
  )) {
    return NextResponse.json(
      { error: APPLIANCE_OPERATOR_MANAGED_MESSAGE, code: "APPLIANCE_OPERATOR_MANAGED" },
      { status: 409 },
    )
  }

  if (await bcrypt.compare(data.password, resetToken.user.passwordHash)) {
    return NextResponse.json({ error: "New password must be different" }, { status: 409 })
  }
  const passwordHash = await bcrypt.hash(data.password, 12)
  try {
    await prisma.$transaction(async transaction => {
      // Conditional claim is the concurrency boundary: at most one request can
      // change usedAt from null, so two confirmations cannot both succeed.
      const claimed = await transaction.passwordResetToken.updateMany({
        where: { id: resetToken.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      })
      if (claimed.count !== 1) throw new ResetClaimFailed()

      const changed = await transaction.user.updateMany({
        where: { id: resetToken.userId, deletedAt: null, anonymizedAt: null },
        data: {
          passwordHash,
          passwordChangedAt: now,
          recoveryRequiredAt: null,
        },
      })
      if (changed.count !== 1) throw new ResetClaimFailed()

      await transaction.passwordResetToken.updateMany({
        where: { userId: resetToken.userId, usedAt: null },
        data: { usedAt: now },
      })
      if (isHospitalDeployment()) {
        await transaction.hospitalAccountAccessToken.updateMany({
          where: {
            userId: resetToken.userId,
            purpose: "RECOVERY",
            consumedAt: null,
            invalidatedAt: null,
          },
          data: { invalidatedAt: now },
        })
      }
      const revokedCount = await revokeAllSessionsInTransaction(
        transaction,
        resetToken.userId,
        now,
        "PASSWORD_RECOVERY",
      )
      await logAuditInTransaction(
        transaction,
        resetToken.userId,
        "PASSWORD_RECOVERY",
        resetToken.userId,
        { revokedSessionCount: revokedCount },
      )
    })
  } catch (error) {
    if (error instanceof ResetClaimFailed) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 })
    }
    throw error
  }
  // Tracked sessions were revoked transactionally above. Prime this instance's
  // account epoch as well for pre-migration JWTs; another instance re-reads a
  // stale legacy-account cache within its one-minute TTL.
  notePasswordChanged(resetToken.userId, now)

  return NextResponse.json({ ok: true })
}
