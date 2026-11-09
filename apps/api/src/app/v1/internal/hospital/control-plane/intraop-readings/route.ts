import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { intraopReadingsControlView } from "@/lib/hospital/intraop-readings-control"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"

/** What the Status "Unusual readings" page works from. Read on its own: it is large, and only that page needs it. */
export async function GET(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    return NextResponse.json(await intraopReadingsControlView(prisma), { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
