import { NextResponse } from "next/server"
import { isHospitalDeployment } from "@/lib/hospital/deployment"
import { applianceStatusSnapshot } from "@/lib/hospital/appliance-status-snapshot"
import {
  configuredStatusTokens,
  bearerToken,
  matchingConfiguredToken,
  STATUS_PRIVATE_NO_STORE as NO_STORE,
} from "@/lib/hospital/status-snapshot-auth"

export async function GET(request: Request) {
  if (!isHospitalDeployment()) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE })
  }
  const expected = await configuredStatusTokens()
  if (expected.length === 0) {
    return NextResponse.json(
      { error: "Status snapshot is not configured", code: "STATUS_SNAPSHOT_NOT_CONFIGURED" },
      { status: 503, headers: NO_STORE },
    )
  }
  const matched = matchingConfiguredToken(bearerToken(request), expected)
  if (!matched) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: NO_STORE },
    )
  }

  // Bind the identity proof to the credential that authenticated this exact
  // request. During a bounded overlap an old Status process therefore sees a
  // proof made with its old token, while a restarted process sees the new one.
  return NextResponse.json(await applianceStatusSnapshot(matched), { headers: NO_STORE })
}

export const dynamic = "force-dynamic"
