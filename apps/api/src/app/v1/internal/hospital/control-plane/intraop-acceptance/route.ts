import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { suggestionAcceptanceTrend } from "@/lib/intraop-automation"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"

// Month-by-month counts for the SPS "Acceptance trend" tab: read only when that tab is open.
export async function GET(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    return NextResponse.json(await suggestionAcceptanceTrend(prisma, 12), { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
