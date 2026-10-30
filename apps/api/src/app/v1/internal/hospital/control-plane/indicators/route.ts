import { NextResponse } from "next/server"
import {
  indicatorsUpdateSchema,
  updateHospitalIndicators,
} from "@/lib/hospital/control-plane"
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
    const input = indicatorsUpdateSchema.parse(await boundedJson(request))
    return NextResponse.json(await updateHospitalIndicators(input), { status: 201, headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
