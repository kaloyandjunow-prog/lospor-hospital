import { NextResponse } from "next/server"
import {
  centralTransportSchema,
  configureCentralTransport,
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
    const input = centralTransportSchema.parse(await boundedJson(request))
    const installation = await configureCentralTransport(input)
    return NextResponse.json({
      siteId: installation.siteId,
      siteCode: installation.siteCode,
      centralEndpoint: installation.centralBaseUrl
        ? new URL(installation.centralBaseUrl).origin : null,
      configurationHash: installation.transportConfigurationHash,
    }, { status: 201, headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
