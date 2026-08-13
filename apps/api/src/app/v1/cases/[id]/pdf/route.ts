import { caseWhereForUser } from "@/lib/access-control"
import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { verifyPrintToken } from "@/lib/print-token"

// GET /api/cases/:id/pdf[?print_token=...]
//
// Hospital 1.0.0 deliberately has no server-side document renderer. Keep this
// retired endpoint explicit for pre-release clients that may still call it:
// an authorized caller receives 410 JSON, never an HTML redirect disguised as
// a PDF response. The supported flow is POST /print-token followed by the
// authorized /cases/:id/print page and the browser's Print / Save as PDF UI.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const queryToken = req.nextUrl.searchParams.get("print_token")
  const tokenUserId = queryToken ? await verifyPrintToken(queryToken, id) : null

  let where
  if (tokenUserId) {
    // The signed, short-lived, case-scoped token was issued only after the
    // requester's institution-aware access check.
    where = { id }
  } else {
    const user = await getAuthUser(req)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    where = caseWhereForUser(user, id)
  }

  const record = await prisma.case.findFirst({ where, select: { id: true } })
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    error: "Server-generated PDF is not available in LOSPOR Hospital 1.0.0. Use the printable HTML record and the browser's Print / Save as PDF command.",
    code: "PRINTABLE_HTML_ONLY",
  }, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  })
}
