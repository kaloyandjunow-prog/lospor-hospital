import { NextResponse } from "next/server"
import {
  caseVisibilityPolicySchema,
  setCaseVisibilityPolicy,
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
    const input = caseVisibilityPolicySchema.parse(await boundedJson(request))
    const policy = await setCaseVisibilityPolicy(input)
    return NextResponse.json({
      enabled: policy.enabled,
      changedAt: policy.changedAt,
      updatedAt: policy.updatedAt,
    }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
