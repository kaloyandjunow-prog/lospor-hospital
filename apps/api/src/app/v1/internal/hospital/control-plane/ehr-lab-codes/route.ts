import { NextResponse } from "next/server"
import {
  clearEhrLabCodeMapping,
  ehrLabCodeMapSchema,
  ehrLabCodeUnmapSchema,
  setEhrLabCodeMapping,
} from "@/lib/hospital/control-plane"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"

/**
 * Map or unmap one of this hospital's laboratory codes.
 *
 * One route for both, discriminated by `action`, because they are two answers
 * to the same question on the same screen row and an operator moves between
 * them freely.
 */
export async function POST(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const body = await boundedJson(request) as Record<string, unknown>
    if (body.action === "unmap") {
      const input = ehrLabCodeUnmapSchema.parse({ system: body.system, code: body.code })
      return NextResponse.json(await clearEhrLabCodeMapping(input), { headers: ACCOUNT_CONTROL_HEADERS })
    }
    const input = ehrLabCodeMapSchema.parse({
      system: body.system, code: body.code, test: body.test, assumedUnit: body.assumedUnit ?? null,
    })
    return NextResponse.json(await setEhrLabCodeMapping(input), { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
