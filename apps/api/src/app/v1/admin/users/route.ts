import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!requireRole(user, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const pending = req.nextUrl.searchParams.get("pending") === "true"

  const users = await prisma.user.findMany({
    where: pending ? { approvedAt: null } : { approvedAt: { not: null } },
    select: {
      id: true, username: true, email: true, name: true, firstName: true, lastName: true,
      title: true, role: true, accountKind: true, activatedAt: true, createdAt: true,
      institution: { select: { name: true, city: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const actor = await getAuthUser(req)
  if (!requireRole(actor, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  // Hospital credentials are created only by the Status-owned activation
  // workflow. Clinical administrators may not choose another user's password
  // or mint ADMIN authority through this legacy owner route.
  return NextResponse.json({
    error: "Create Hospital accounts from Status",
    code: "STATUS_ACCOUNT_PROVISIONING_REQUIRED",
  }, { status: 404 })
}
