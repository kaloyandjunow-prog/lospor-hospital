import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { corsHeaders } from "@/lib/cors"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "@/lib/hospital/deployment"
import { checkIzYear } from "@/lib/hospital/iz-year-signals"

/**
 * Which year a typed ИЗ № belongs to, for a new case or a correction (1.9.2).
 *
 * Answers only the choice and what it rests on; never the stored numbers, and
 * never whether another admission exists beyond the year it would be filed
 * under. Outside the first 60 days of the year it reads nothing and says the
 * choice is closed.
 */

const querySchema = z.object({ number: z.string().trim().min(1).max(128) })

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders(req) })
  if (!isHospitalDeployment()) return NextResponse.json({ error: "Not found" }, { status: 404, headers: corsHeaders(req) })
  if (!user.institutionId) {
    return NextResponse.json({ error: "This account has no institution", code: "NO_INSTITUTION" }, { status: 409, headers: corsHeaders(req) })
  }
  const parsed = querySchema.safeParse({ number: req.nextUrl.searchParams.get("number") ?? "" })
  if (!parsed.success) {
    return NextResponse.json({ error: "An identifier is required", code: "INVALID_IDENTIFIER" }, { status: 400, headers: corsHeaders(req) })
  }
  const choice = await checkIzYear(prisma, user.institutionId, parsed.data.number)
  return NextResponse.json(choice, { headers: { ...corsHeaders(req), "Cache-Control": "no-store" } })
}
