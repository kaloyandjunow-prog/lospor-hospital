import { NextResponse } from "next/server"
import {
  drugColorUpdateSchema,
  updateHospitalDrugColor,
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
    const input = drugColorUpdateSchema.parse(await boundedJson(request))
    return NextResponse.json(await updateHospitalDrugColor(input), { status: 201, headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
