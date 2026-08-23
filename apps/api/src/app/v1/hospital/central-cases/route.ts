import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@/generated/prisma/client"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "@/lib/hospital/deployment"
import { projectCaseCentralExport } from "@/lib/hospital/case-central-export"

const PAGE_SIZE = 20
const MAX_PAGE = 100_000
const RESPONSE_HEADERS = { "cache-control": "private, no-store, max-age=0" }

function parsePage(request: Request): number | null {
  const raw = new URL(request.url).searchParams.get("page") ?? "0"
  if (!/^\d{1,6}$/.test(raw)) return null
  const page = Number(raw)
  return Number.isSafeInteger(page) && page <= MAX_PAGE ? page : null
}

function actorScope(user: {
  id: string
  role: string
  institutionId: string | null
}): Prisma.CaseWhereInput | null {
  if (user.role === "ADMIN") return {}
  if (user.role === "HEAD_OF_DEPT") {
    return user.institutionId ? { institutionId: user.institutionId } : null
  }
  if (user.role === "MEMBER") return { createdById: user.id }
  return null
}

/**
 * A deliberately narrow discovery surface for Web Central governance.
 *
 * It is separate from ordinary case access: an immutable creator can find a
 * transferred case here without receiving the clinical record, patient link,
 * current assignee, case code, Central pseudonym, batch id, or audit material.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  const scope = user?.accountKind === "CLINICAL"
    ? actorScope({ id: user.id, role: user.role, institutionId: user.institutionId })
    : null
  if (!isHospitalDeployment() || !user || scope === null) {
    return NextResponse.json({ error: "Forbidden" }, {
      status: 403,
      headers: RESPONSE_HEADERS,
    })
  }

  const page = parsePage(request)
  if (page === null) {
    return NextResponse.json({ error: "Invalid page" }, {
      status: 400,
      headers: RESPONSE_HEADERS,
    })
  }

  const where: Prisma.CaseWhereInput = {
    ...scope,
    status: "COMPLETE",
    finalizedAt: { not: null },
  }
  const [total, records] = await Promise.all([
    prisma.case.count({ where }),
    prisma.case.findMany({
      where,
      orderBy: [{ finalizedAt: "desc" }, { id: "desc" }],
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        finalizedAt: true,
        centralExportControl: {
          select: { decision: true, decidedAt: true },
        },
        centralExportCheckpoint: {
          select: { lastAction: true, acceptedAt: true },
        },
        centralExportRejection: {
          select: { errorCode: true },
        },
        centralDeliveryCases: {
          orderBy: { batch: { createdAt: "desc" } },
          take: 1,
          select: {
            action: true,
            batch: {
              select: {
                status: true,
                acceptedAt: true,
                errorCode: true,
              },
            },
          },
        },
      },
    }),
  ])

  return NextResponse.json({
    schemaVersion: 1,
    cases: records.map(record => ({
      caseId: record.id,
      // The query excludes null. Keep the guard so no malformed record can
      // turn into a misleading epoch or an unbounded serialization failure.
      finalizedAt: record.finalizedAt!.toISOString(),
      control: projectCaseCentralExport(record),
    })),
    page,
    pageSize: PAGE_SIZE,
    total,
  }, { headers: RESPONSE_HEADERS })
}

export const dynamic = "force-dynamic"
