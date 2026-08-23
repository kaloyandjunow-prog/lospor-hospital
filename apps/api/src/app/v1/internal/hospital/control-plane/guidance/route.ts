import { NextResponse } from "next/server"
import {
  guidancePolicySchema,
  setGuidancePolicy,
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
    const input = guidancePolicySchema.parse(await boundedJson(request))
    const policy = await setGuidancePolicy(input)
    return NextResponse.json({
      adultEnabled: policy.adultEnabled,
      pediatricEnabled: policy.pediatricEnabled,
      updatedAt: policy.updatedAt,
    }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
