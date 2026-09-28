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
import { searchMedicationCatalog } from "@/lib/hospital/ehr-medication-code-map"

/** Search the medication list for Status, by name, INN or ATC code. */
export async function GET(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100)
  const results = query.length >= 2 ? searchMedicationCatalog(query) : []
  return NextResponse.json({ query, results }, { headers: ACCOUNT_CONTROL_HEADERS })
}

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
      system: body.system, code: body.code, drugId: body.drugId, catalogId: body.catalogId,
    })
    return NextResponse.json(await setEhrMedicationCodeMapping(input), { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
