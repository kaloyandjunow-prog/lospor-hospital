import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"
import { AUTH_TOKEN_TTL_SECONDS, signMobileToken } from "@/lib/mobile-auth"
import { corsHeaders } from "@/lib/cors"
import { verifyCredentials } from "@/lib/credentials"
import { authenticationRateLimitKey, parseAuthenticationRequest } from "@/lib/authentication-identity"
import { authenticationDeploymentMode } from "@/lib/deployment-capabilities"
import { preferredLocaleFromPreferences, preferencesWithPreferredLocale } from "@/lib/account-locale"
import { invalidateAccountState } from "@/lib/password-epoch"
import type { Prisma } from "@/generated/prisma/client"

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req, "POST, OPTIONS", "Content-Type, Authorization") })
}

// Mobile login — returns a signed JWT as { access_token, token_type, expires_in }.
// Web sessions continue to use NextAuth cookie auth; this endpoint is for the React Native app only.
export async function POST(req: NextRequest) {
  const body = parseAuthenticationRequest(await req.json().catch(() => null))
  if (!body) {
    if (authenticationDeploymentMode() === "UNAVAILABLE") {
      return NextResponse.json({
        error: "Authentication is unavailable",
        code: "AUTHENTICATION_DEPLOYMENT_UNAVAILABLE",
      }, { status: 503, headers: corsHeaders(req, "POST, OPTIONS", "Content-Type, Authorization") })
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  // Throttle per identity and per IP without retaining a raw identifier.
  const ip = req.headers.get("x-forwarded-for") ?? "unknown"
  const [rlIdentity, rlIp] = await Promise.all([
    rateLimit(authenticationRateLimitKey(body.identifier), 10, 15 * 60 * 1000),
    rateLimit(`login-ip:${ip}`, 50, 15 * 60 * 1000),
  ])
  if (!rlIdentity.allowed || !rlIp.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const user = await verifyCredentials(body.identifier, body.password)
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const preferredLocale = body.locale ?? preferredLocaleFromPreferences(user.preferences)

  const jti = crypto.randomUUID()
  const loginUpdate = prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      ...(body.locale
        ? { preferences: preferencesWithPreferredLocale(user.preferences, body.locale) as Prisma.InputJsonValue }
        : {}),
    },
  })
  if (body.locale) await loginUpdate
  else await loginUpdate.catch(() => null)
  if (body.locale) invalidateAccountState(user.id)

  const token = await signMobileToken({
    id:              user.id,
    jti,
    role:            user.role,
    institutionId:   user.institutionId,
    institutionName: user.institution?.name ?? null,
    firstName:       user.firstName,
    lastName:        user.lastName,
    title:           user.title,
    lastLoginAt:     user.lastLoginAt?.toISOString() ?? null,
    preferredLocale,
  })

  return NextResponse.json({
    access_token: token,
    token_type:   "Bearer",
    expires_in:   AUTH_TOKEN_TTL_SECONDS,
    preferredLocale,
  })
}
