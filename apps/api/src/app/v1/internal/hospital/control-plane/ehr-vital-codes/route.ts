import { NextResponse } from "next/server"
import {
  clearEhrVitalCodeMapping,
  ehrVitalCodeMapSchema,
  ehrVitalCodeUnmapSchema,
  setEhrVitalCodeMapping,
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
    const body = await boundedJson(request) as Record<string, unknown>
    if (body.action === "unmap") {
      const input = ehrVitalCodeUnmapSchema.parse({ system: body.system, code: body.code })
      return NextResponse.json(await clearEhrVitalCodeMapping(input), { headers: ACCOUNT_CONTROL_HEADERS })
    }
    const input = ehrVitalCodeMapSchema.parse({
      system: body.system, code: body.code, field: body.field,
    })
    return NextResponse.json(await setEhrVitalCodeMapping(input), { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
