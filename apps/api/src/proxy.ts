import { NextRequest, NextResponse } from "next/server"
import { corsHeaders } from "@/lib/cors"
import { validateCookieWriteOrigin } from "@/lib/csrf"
import { getAuthUser } from "@/lib/mobile-auth"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"

const CSRF_EXEMPT = [
  "/v1/auth/token",
  "/v1/auth/session",
  "/v1/auth/register",
  "/v1/auth/password-reset/request",
  "/v1/auth/password-reset/confirm",
  "/v1/auth/verify-email/resend",
]

function applyApiHeaders(
  response: NextResponse,
  req: NextRequest,
  requestId: string,
): NextResponse {
  for (const [name, value] of Object.entries(corsHeaders(req, CORS_METHODS))) {
    response.headers.set(name, value)
  }
  response.headers.set("X-LOSPOR-API-Version", "1")
  response.headers.set("X-Request-Id", requestId)
  return response
}

const RESEARCH_ONLY_ALLOWED = [
  "/v1/auth/",
  "/v1/research/",
]

export function isResearchOnlyAllowedPath(pathname: string): boolean {
  if ([
    "/v1/user",
    "/v1/user/delete",
    "/v1/user/accept-terms",
    "/v1/user/institution-request",
    "/v1/locale",
    "/v1/capabilities",
    "/v1/institutions",
  ].includes(pathname)) return true
  return RESEARCH_ONLY_ALLOWED.some(prefix => pathname.startsWith(prefix))
}

export default async function proxy(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID()
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-request-id", requestId)

  if (req.method === "OPTIONS" && req.nextUrl.pathname.startsWith("/v1/")) {
    return applyApiHeaders(
      new NextResponse(null, { status: 204 }),
      req,
      requestId,
    )
  }

  // Hospital's pinned shared API still authenticates the legacy RESEARCHER
  // role. Status writes AccountKind=RESEARCH_ONLY as the durable authority and
  // also writes that compatibility role until the staged 1.2.0 import lands.
  // This Hospital-only boundary prevents such an account entering any clinical
  // route in the interim. The public demo is intentionally unchanged.
  if (
    isHospitalDeployment()
    && !isResearchOnlyAllowedPath(req.nextUrl.pathname)
  ) {
    const account = await getAuthUser(req)
    if (account?.role === "RESEARCHER") {
      return applyApiHeaders(
        NextResponse.json({
          error: "Clinical application access is not available for this account",
          code: "CLINICAL_APP_FORBIDDEN",
          requestId,
        }, { status: 403 }),
        req,
        requestId,
      )
    }
  }

  if (
    req.nextUrl.pathname.startsWith("/v1/") &&
    !CSRF_EXEMPT.includes(req.nextUrl.pathname)
  ) {
    const result = validateCookieWriteOrigin(req)
    if (result === "fail") {
      return applyApiHeaders(
        NextResponse.json({ error: "Forbidden", requestId }, { status: 403 }),
        req,
        requestId,
      )
    }
  }

  return applyApiHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    req,
    requestId,
  )
}

export const config = {
  matcher: ["/v1/:path*"],
}
