import { NextResponse } from "next/server"
import { z } from "zod"

import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"
import { checkInboxDocument } from "@/lib/hospital/ehr-inbox-folder"

/** A sample, not an archive: real admission files are a few kilobytes. */
const CHECK_FILE_MAX_BYTES = 1024 * 1024

const schema = z.object({
  /** Shown back in the answer only, so the operator can tell checks apart. */
  file: z.string().trim().max(200).optional(),
  content: z.string().min(1),
}).strict()

/**
 * "Check a file" (1.5.0): what the inbox would do with a file the hospital
 * system's team has produced, before they drop it for real.
 *
 * Vendor onboarding used to be: drop a file, wait for the scan, ask us what
 * happened. This runs the inbox's own reader on the bytes -- the same
 * function, so the answer cannot drift from what a real drop does -- and stages,
 * moves and records nothing. The patient number in a sample is never stored,
 * logged or echoed back.
 */
export async function POST(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    // An oversized or malformed sample is the caller's mistake, said as one.
    const body = await boundedJson(request, CHECK_FILE_MAX_BYTES + 4096).catch(() => undefined)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Send the file content as text, up to 1 MB", code: "INVALID_CONTROL_REQUEST" },
        { status: 400, headers: ACCOUNT_CONTROL_HEADERS },
      )
    }
    const { file, content } = parsed.data
    const report = await checkInboxDocument(content, { file })
    return NextResponse.json({ report }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
