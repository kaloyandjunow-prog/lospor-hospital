import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { prisma } from "@/lib/prisma"
import { AUDIT_ACTION_REGISTRY, isAuditActionCode } from "@/lib/audit-actions"

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!requireRole(user, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const rawPage = req.nextUrl.searchParams.get("page") ?? "0"
  const page = /^\d+$/.test(rawPage) ? Number(rawPage) : 0
  const action = req.nextUrl.searchParams.get("action") ?? ""

  if (action && !isAuditActionCode(action)) {
    return NextResponse.json({ error: "Unknown audit action" }, { status: 400 })
  }

  const where = action ? { action } : {}

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:    page * PAGE_SIZE,
      take:    PAGE_SIZE,
    }),
  ])

  const userIds = [...new Set(logs.map(l => l.userId))]
  const users   = await prisma.user.findMany({
    where:  { id: { in: userIds } },
    select: { id: true, name: true, firstName: true, lastName: true, title: true },
  })
  const userMap = Object.fromEntries(users.map(u => [u.id, u]))

  const rows = logs.map(l => {
    const actor = userMap[l.userId]
    return {
      id: l.id,
      createdAt: l.createdAt,
      action: l.action,
      // Raw detail, entity identifiers, and internal actor IDs intentionally
      // stay server-side. Older rows predate the strict privacy guard and can
      // contain material that is neither needed nor safe to reproduce in every
      // administrator client.
      user: actor ? {
        name: actor.name,
        firstName: actor.firstName,
        lastName: actor.lastName,
        title: actor.title,
      } : { name: null },
    }
  })

  return NextResponse.json({
    schemaVersion: 1,
    logs: rows,
    actions: AUDIT_ACTION_REGISTRY,
    total,
    page,
    pageSize: PAGE_SIZE,
  })
}
