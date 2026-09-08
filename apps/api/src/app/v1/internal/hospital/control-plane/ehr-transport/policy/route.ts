import { NextResponse } from "next/server"
import {
  ehrTransportPolicySchema,
  setEhrTransportPolicy,
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
    const input = ehrTransportPolicySchema.parse(await boundedJson(request))
    const policy = await setEhrTransportPolicy(input)
    return NextResponse.json({
      transport: policy.transport,
      transportChangedAt: policy.transportChangedAt,
    }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
