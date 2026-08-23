import { NextResponse } from "next/server"
import {
  externalAiPolicySchema,
  setExternalAiPolicy,
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
    const input = externalAiPolicySchema.parse(await boundedJson(request))
    const policy = await setExternalAiPolicy(input)
    return NextResponse.json({
      externalAiEnabled: policy.externalAiEnabled,
      provider: policy.provider,
      policyChangedAt: policy.policyChangedAt,
    }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
