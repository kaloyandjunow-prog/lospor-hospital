import { NextResponse } from "next/server"
import {
  centralClinicalPolicySchema,
  setCentralClinicalPolicy,
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
    const input = centralClinicalPolicySchema.parse(await boundedJson(request))
    const policy = await setCentralClinicalPolicy(input)
    return NextResponse.json({
      enabled: policy.enabled,
      includeRedactedText: policy.includeRedactedText,
      redactionProfile: policy.redactionProfile,
      approvedAt: policy.approvedAt,
    }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
