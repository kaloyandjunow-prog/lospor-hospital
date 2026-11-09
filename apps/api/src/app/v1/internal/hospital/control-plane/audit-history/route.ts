import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auditHistory } from "@/lib/hospital/audit-history"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"

// The Status "Change history" page: who changed which setting, and when. Read only.
export async function GET(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const params = new URL(request.url).searchParams
    const page = Number.parseInt(params.get("page") ?? "0", 10)
    return NextResponse.json(await auditHistory(prisma, {
      page: Number.isFinite(page) ? page : 0,
      category: params.get("category"),
      action: params.get("action"),
    }), { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
