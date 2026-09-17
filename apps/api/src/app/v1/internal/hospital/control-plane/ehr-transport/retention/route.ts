import { NextResponse } from "next/server"
import {
  ehrStagingRetentionSchema,
  setEhrStagingRetention,
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
    const input = ehrStagingRetentionSchema.parse(await boundedJson(request))
    const policy = await setEhrStagingRetention(input)
    return NextResponse.json({
      stagingRetentionDays: policy.stagingRetentionDays,
      stagingRetentionChangedAt: policy.stagingRetentionChangedAt,
    }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
