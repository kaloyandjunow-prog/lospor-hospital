import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { rateLimit } from "@/lib/rate-limit"
import { corsHeaders } from "@/lib/cors"
import { createAuthToken, EMAIL_VERIFICATION_TTL_MS, emailSchema, hashAuthToken, normalizeEmail, tokenExpiry } from "@/lib/auth-email-tokens"
import { appUrl, sendVerificationEmail } from "@/lib/transactional-email"
import { CURRENT_TERMS_VERSION } from "@lospor/core/account"
import { passwordSchema } from "@/lib/password-policy"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req, "POST, OPTIONS", "Content-Type, Authorization") })
}

const schema = z.object({
  title:          z.string().optional(),
  firstName:      z.string().min(1, "First name required"),
  lastName:       z.string().min(1, "Last name required"),
  email:          emailSchema,
  // Required. An account with no institution produced cases stamped with no
  // institution, and those became visible to whichever department the author
  // later joined. Anyone without a department picks "Без институция"
  // (NO_INSTITUTION_ID), which is a real institution that cannot have a head.
  // Not .cuid(): NO_INSTITUTION_ID is a fixed readable id, not a generated one.
  institutionId:  z.string().min(1),
  acceptedTerms:  z.boolean().refine(v => v === true, "You must accept the terms"),
  password: passwordSchema,
})

export async function POST(req: NextRequest) {
  if (isHospitalDeployment()) {
    return NextResponse.json({
      error: "Self-registration is disabled. Contact your hospital administrator.",
      code: "SELF_REGISTRATION_DISABLED",
    }, { status: 403 })
  }
  const ip = req.headers.get("x-forwarded-for") ?? "unknown"
  const rl = await rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429, headers: { "Retry-After": String(rl.retryAfter) },
    })
  }

  try {
    const body = await req.json()
    const data = schema.parse(body)
    const email = normalizeEmail(data.email)

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 })
    }

    if (data.institutionId) {
      const institution = await prisma.institution.findUnique({ where: { id: data.institutionId } })
      if (!institution) {
        return NextResponse.json({ error: "Institution not found" }, { status: 404 })
      }
    }

    const passwordHash = await bcrypt.hash(data.password, 12)
    const name = [data.title, data.firstName, data.lastName].filter(Boolean).join(" ")

    const token = createAuthToken()
    const user = await prisma.user.create({
      data: {
        name,
        firstName:       data.firstName,
        lastName:        data.lastName,
        title:           data.title ?? "",
        email,
        passwordHash,
        institutionId:   data.institutionId || null,
          role:            "MEMBER",
          approvedAt:      null,
          activatedAt:     null,
          emailVerifiedAt: null,
        acceptedTermsAt: new Date(),
        termsVersion:    CURRENT_TERMS_VERSION,
        emailVerificationTokens: {
          create: {
            tokenHash: hashAuthToken(token),
            expiresAt: tokenExpiry(EMAIL_VERIFICATION_TTL_MS),
          },
        },
      },
    })

    const verifyUrl = appUrl(`/verify-email?token=${encodeURIComponent(token)}`)
    let emailSent = false
    try {
      const result = await sendVerificationEmail({ email, name: user.name }, verifyUrl)
      emailSent = result.sent
    } catch {
      console.error("[register.verify-email] EMAIL_DELIVERY_FAILED")
    }

    const exposeTestLink = process.env.NODE_ENV !== "production" && (process.env.AUTH_EMAIL_TEST_LINKS === "true" || !process.env.BREVO_API_KEY)
    return NextResponse.json({
      id: user.id,
      email: user.email,
      pending: false,
      verificationRequired: true,
      emailSent,
      ...(exposeTestLink ? { devVerifyUrl: verifyUrl } : {}),
    }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 })
    }
    console.error("[register] ACCOUNT_CREATION_FAILED")
    const msg = "Internal server error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
