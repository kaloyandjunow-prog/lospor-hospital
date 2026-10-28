import { caseReadWhereForUser } from "@/lib/access-control"
import { NextRequest, NextResponse } from "next/server"
import { SignJWT } from "jose"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { parseConsentTechniques } from "@lospor/core/preop-documents"

function secret() {
  const value = process.env.LOSPOR_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!value) throw new Error("LOSPOR_AUTH_SECRET or NEXTAUTH_SECRET is required")
  return new TextEncoder().encode(value)
}

// POST /api/cases/:id/print-token
// Issues a short-lived (5 min) signed token that lets the holder view and
// print the case protocol page without a full web session. Used by the mobile
// app to open the printable HTML record in the device browser. Hospital 1.0.0
// does not generate a PDF on the server; the browser owns printing and any
// optional "Save as PDF" action.
//
// `doc: "preop-summary"` links the preop summary (and consent) page instead,
// with layout C's ticked techniques as known technique keys only (1.6.0).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // This shared predicate preserves institution scope for members, heads of
  // department, and administrators before any browser token is issued.
  const record = await prisma.case.findFirst({
    where: await caseReadWhereForUser(user, id),
    select: { id: true },
  })
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Sign a 5-minute print token
  // jti so the token can be revoked. Print tokens travel in a query string —
  // they end up in access logs, browser history and Referer headers — so the
  // 5-minute window is the main protection, and revocability is the backstop.
  const token = await new SignJWT({ caseId: id, userId: user.id, type: "print" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret())

  const base =
    process.env.LOSPOR_WEB_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    (process.env.NODE_ENV === "production" ? null : `http://${req.headers.get("host")}`)
  if (!base) {
    console.error("[print-token] LOSPOR_WEB_URL must be set in production")
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
  }

  const requestBody = await req.json().catch(() => null) as { lang?: unknown; doc?: unknown; techniques?: unknown } | null
  const lang = requestBody?.lang === "bg" || requestBody?.lang === "en"
    ? requestBody.lang
    : null
  const preopSummary = requestBody?.doc === "preop-summary"
  const query = new URLSearchParams({ print_token: token })
  if (lang) query.set("lang", lang)
  // Sent even when empty: "nothing ticked" must not fall back to the planned anaesthesia.
  if (preopSummary && Array.isArray(requestBody?.techniques)) {
    const raw = requestBody.techniques.filter((item): item is string => typeof item === "string").join(",")
    query.set("techniques", parseConsentTechniques(raw).join(","))
  }
  const page = preopSummary ? "preop-summary/print" : "print"
  const url = `${base.replace(/\/$/, "")}/cases/${encodeURIComponent(id)}/${page}?${query.toString()}`

  return NextResponse.json({ token, url, format: "html", action: "print" })
}
