import { NextResponse } from "next/server"
import { setHospitalIntraopAutomation } from "@/lib/hospital/control-plane"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"

export async function POST(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const settings = await setHospitalIntraopAutomation(await boundedJson(request))
    return NextResponse.json({ enabled: settings.enabled }, { status: 201, headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
