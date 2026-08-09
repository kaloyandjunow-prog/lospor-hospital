import { NextRequest, NextResponse } from "next/server"
import { LOSPOR_WEB_CLIENT_VERSION } from "@/lib/client-version"

const MOBILE_PWA_URL = process.env.MOBILE_PWA_URL
const SESSION_COOKIE = "lospor_session"

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/privacy",
  "/terms",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]

const MOBILE_BYPASS = [
  /^\/api\//,
  /^\/_next\//,
  /^\/icons\//,
  /^\/manifest/,
  /^\/sw\.js/,
  /^\/offline/,
  /\.(png|jpg|svg|webp|ico|json|txt|xml)$/,
]

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(path => pathname.startsWith(path))
}

function mobileRedirect(req: NextRequest): NextResponse | null {
  if (process.env.E2E_DISABLE_MOBILE_REDIRECT === "true" || !MOBILE_PWA_URL) {
    return null
  }
  const { pathname } = req.nextUrl
  if (MOBILE_BYPASS.some(pattern => pattern.test(pathname))) return null
  const isRootish =
    pathname === "/" ||
    pathname.startsWith("/cases") ||
    pathname.startsWith("/dashboard")
  if (!isRootish) return null
  const userAgent = req.headers.get("user-agent") ?? ""
  if (!/android|iphone|ipad|ipod|mobile|blackberry|windows phone/i.test(userAgent)) {
    return null
  }
  return NextResponse.redirect(
    `${MOBILE_PWA_URL}${pathname}${req.nextUrl.search}`,
    { status: 302 },
  )
}

export default function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set("x-lospor-client", "web")
    requestHeaders.set("x-lospor-client-version", LOSPOR_WEB_CLIENT_VERSION)
    return NextResponse.next({
      request: { headers: requestHeaders },
    })
  }
  if (req.nextUrl.pathname === "/register") {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  if (
    /^\/cases\/[^/]+\/print$/.test(req.nextUrl.pathname) &&
    req.nextUrl.searchParams.has("print_token")
  ) {
    return NextResponse.next()
  }

  const redirect = mobileRedirect(req)
  if (redirect) return redirect

  const hasSession = req.cookies.has(SESSION_COOKIE)
  if (!hasSession && !isPublicPath(req.nextUrl.pathname)) {
    const login = new URL("/login", req.url)
    login.searchParams.set("callbackUrl", req.nextUrl.pathname)
    return NextResponse.redirect(login)
  }
  // Deliberately not redirecting away from /login just because a cookie exists.
  //
  // Cookie presence is not proof of a valid session. With an expired or revoked
  // cookie this sent the user to /dashboard, the protected page validated the
  // session properly and sent them back to /login, and round it went — escapable
  // only by clearing browser data, which at 2am reads as "the app is broken".
  //
  // Letting /login render lets it clear or replace the stale cookie, which is
  // the only place that can happen. A genuinely signed-in user visiting /login
  // sees the login page; that is a far smaller cost than a redirect loop.
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
}
