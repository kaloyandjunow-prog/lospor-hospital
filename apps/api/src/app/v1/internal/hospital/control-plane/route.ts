import { NextResponse } from "next/server"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"
import { hospitalControlPlaneView } from "@/lib/hospital/control-plane"

export async function GET(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    return NextResponse.json(await hospitalControlPlaneView(), {
      headers: ACCOUNT_CONTROL_HEADERS,
    })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
