import { NextResponse } from "next/server"
import {
  clearEhrMedicationCodeMapping,
  ehrMedicationCodeMapSchema,
  ehrMedicationCodeUnmapSchema,
  setEhrMedicationCodeMapping,
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
      const input = ehrMedicationCodeUnmapSchema.parse({ system: body.system, code: body.code })
      return NextResponse.json(await clearEhrMedicationCodeMapping(input), { headers: ACCOUNT_CONTROL_HEADERS })
    }
    const input = ehrMedicationCodeMapSchema.parse({
      system: body.system, code: body.code, drugId: body.drugId,
    })
    return NextResponse.json(await setEhrMedicationCodeMapping(input), { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
