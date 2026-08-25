import { NextResponse } from "next/server"

/**
 * Central transport used to be enrollable with a clinical ADMIN session. That
 * merged clinical authority, transport credentials and export policy into one
 * unaudited path. In Hospital 1.2.0 it is deliberately absent: the independent
 * Status control plane performs transport setup with password reauthentication
 * and records its lock separately from clinical-export approval.
 */
export async function POST(_request: Request) {
  return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, {
    status: 404,
    headers: { "cache-control": "private, no-store, max-age=0" },
  })
}

export const dynamic = "force-dynamic"
