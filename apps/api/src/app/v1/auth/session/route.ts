import { NextRequest, NextResponse } from "next/server"
import { verifyCredentials } from "@/lib/credentials"
import { authenticationRateLimitKey, parseAuthenticationRequest } from "@/lib/authentication-identity"
import { authenticationDeploymentMode } from "@/lib/deployment-capabilities"
import {
  AUTH_COOKIE_NAME,
  AUTH_TOKEN_TTL_SECONDS,
  getAuthUser,
  signMobileToken,
} from "@/lib/mobile-auth"
import { rateLimit } from "@/lib/rate-limit"
import { prisma } from "@/lib/prisma"
import { revokeToken } from "@/lib/token-blocklist"
import { preferredLocaleFromPreferences, preferencesWithPreferredLocale } from "@/lib/account-locale"
import { invalidateAccountState } from "@/lib/password-epoch"
import type { Prisma } from "@/generated/prisma/client"

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: AUTH_TOKEN_TTL_SECONDS,
  }
}

export async function POST(req: NextRequest) {
  const parsed = parseAuthenticationRequest(await req.json().catch(() => null))
  if (!parsed) {
    if (authenticationDeploymentMode() === "UNAVAILABLE") {
      return NextResponse.json({
        error: "Authentication is unavailable",
        code: "AUTHENTICATION_DEPLOYMENT_UNAVAILABLE",
      }, { status: 503 })
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const ip = req.headers.get("x-forwarded-for") ?? "unknown"
  const [identifierLimit, ipLimit] = await Promise.all([
    rateLimit(authenticationRateLimitKey(parsed.identifier), 10, 15 * 60 * 1000),
    rateLimit(`login-ip:${ip}`, 50, 15 * 60 * 1000),
  ])
  if (!identifierLimit.allowed || !ipLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const user = await verifyCredentials(parsed.identifier, parsed.password)
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const preferredLocale = parsed.locale ?? preferredLocaleFromPreferences(user.preferences)

  const jti = crypto.randomUUID()
  const token = await signMobileToken({
    id: user.id,
    jti,
    role: user.role,
    institutionId: user.institutionId,
    institutionName: user.institution?.name ?? null,
    firstName: user.firstName,
    lastName: user.lastName,
    title: user.title,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    preferredLocale,
  })

  const loginUpdate = prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      ...(parsed.locale
        ? { preferences: preferencesWithPreferredLocale(user.preferences, parsed.locale) as Prisma.InputJsonValue }
        : {}),
    },
  })
  if (parsed.locale) await loginUpdate
  else await loginUpdate.catch(() => null)
  if (parsed.locale) invalidateAccountState(user.id)

  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      title: user.title,
      role: user.role,
      institutionId: user.institutionId,
      institutionName: user.institution?.name ?? null,
      acceptedTermsAt: user.acceptedTermsAt?.toISOString() ?? null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      preferredLocale,
    },
  })
  response.cookies.set(AUTH_COOKIE_NAME, token, cookieOptions())
  return response
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      username: true,
      name: true,
      preferences: true,
      acceptedTermsAt: true,
      lastLoginAt: true,
    },
  })
  if (!account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json({
    user: {
      ...user,
      email: account.email,
      username: account.username,
      name: account.name,
      preferredLocale: preferredLocaleFromPreferences(account.preferences),
      acceptedTermsAt: account.acceptedTermsAt?.toISOString() ?? null,
      lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
    },
  })
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser(req)
  if (user?.jti) {
    await revokeToken(
      user.jti,
      new Date(Date.now() + AUTH_TOKEN_TTL_SECONDS * 1000),
    )
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    ...cookieOptions(),
    maxAge: 0,
  })
  return response
}
