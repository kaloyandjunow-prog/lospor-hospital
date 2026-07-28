import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { emailSchema, normalizeEmail } from "@/lib/auth-email-tokens"
import { passwordSchema } from "@/lib/password-policy"
import { logAudit } from "@/lib/audit"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!requireRole(user, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const pending = req.nextUrl.searchParams.get("pending") === "true"

  const users = await prisma.user.findMany({
    where: pending ? { approvedAt: null } : { approvedAt: { not: null } },
    select: {
      id: true, email: true, name: true, firstName: true, lastName: true,
      title: true, role: true, createdAt: true,
      institution: { select: { name: true, city: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(users)
}

const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  title: z.string().trim().max(40).optional(),
  role: z.enum(["MEMBER", "HEAD_OF_DEPT", "ADMIN"]).default("MEMBER"),
  institutionId: z.string().cuid().optional(),
})

export async function POST(req: NextRequest) {
  const actor = await getAuthUser(req)
  if (!isHospitalDeployment() || !requireRole(actor, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const parsed = createUserSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues[0]?.message ?? "Invalid request",
    }, { status: 400 })
  }
  const institutionId = parsed.data.institutionId ?? actor.institutionId
  if (!institutionId) {
    return NextResponse.json({ error: "Institution is required" }, { status: 400 })
  }
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { id: true },
  })
  if (!institution) {
    return NextResponse.json({ error: "Institution not found" }, { status: 404 })
  }
  const email = normalizeEmail(parsed.data.email)
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 })
  }
  const now = new Date()
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      title: parsed.data.title ?? "",
      name: [parsed.data.title, parsed.data.firstName, parsed.data.lastName]
        .filter(Boolean).join(" "),
      role: parsed.data.role,
      institutionId,
      approvedAt: now,
      emailVerifiedAt: now,
    },
    select: {
      id: true, email: true, name: true, role: true, institutionId: true,
      createdAt: true,
    },
  })
  await logAudit(actor.id, "HOSPITAL_USER_CREATE", user.id, { role: user.role })
  return NextResponse.json(user, { status: 201 })
}
