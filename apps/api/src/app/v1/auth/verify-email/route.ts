import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashAuthToken } from "@/lib/auth-email-tokens"
import { appUrl } from "@/lib/transactional-email"
import { logAuditInTransaction } from "@/lib/audit"

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? ""
  if (token.length < 20) {
    return NextResponse.redirect(appUrl("/verify-email?status=invalid"))
  }

  const now = new Date()
  const verificationToken = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashAuthToken(token) },
    include: { user: true },
  })

  if (!verificationToken || verificationToken.usedAt || verificationToken.expiresAt < now || verificationToken.user.deletedAt) {
    return NextResponse.redirect(appUrl("/verify-email?status=invalid"))
  }

  await prisma.$transaction(async tx => {
    await tx.user.update({
      where: { id: verificationToken.userId },
      data: {
        // Verification only. This also set approvedAt, which meant clicking the
        // link in your own inbox approved your own account — the admin approval
        // queue could never gate anything. Approval is granted by an
        // administrator through /v1/admin/users/[id]/approve.
        emailVerifiedAt: verificationToken.user.emailVerifiedAt ?? now,
      },
    })
    await tx.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { usedAt: now },
    })
    await tx.emailVerificationToken.updateMany({
      where: { userId: verificationToken.userId, usedAt: null, id: { not: verificationToken.id } },
      data: { usedAt: now },
    })
    await logAuditInTransaction(tx, verificationToken.userId, "ACCOUNT_ACTIVATE", verificationToken.userId, {
      changedFields: ["emailVerifiedAt"],
    })
  })

  return NextResponse.redirect(appUrl("/verify-email?status=verified"))
}
