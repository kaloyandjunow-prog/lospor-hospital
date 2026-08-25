import { NextRequest, NextResponse } from "next/server"
import { researchLoginUrl } from "@/lib/safe-navigation"

const SESSION_COOKIE = "lospor_session"
const PROTECTED_ROOTS = [
  "/overview",
  "/cohorts",
  "/compare",
  "/cases",
  "/quality",
  "/benchmarks",
  "/exports",
  "/governance",
] as const

export default function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const protectedPath = PROTECTED_ROOTS.some(root =>
    pathname === root || pathname.startsWith(`${root}/`),
  )
  if (protectedPath && !request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(
      new URL(researchLoginUrl(pathname, request.nextUrl.search), request.url),
    )
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/overview/:path*",
    "/cohorts/:path*",
    "/compare/:path*",
    "/cases/:path*",
    "/quality/:path*",
    "/benchmarks/:path*",
    "/exports/:path*",
    "/governance/:path*",
  ],
}
