import { NextResponse } from "next/server"
import { cardPreview, isPreviewPatient, PREVIEW_PATIENTS } from "@/lib/hospital/card-preview"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"

// The Status "Card preview" tab: a treatment card as a clinician sees it, for a sample patient. Read only.
export async function GET(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const params = new URL(request.url).searchParams
    const requested = params.get("patient") ?? "adult"
    const patient = isPreviewPatient(requested) ? requested : "adult"
    const complication = (params.get("complication") ?? "").slice(0, 120)
    return NextResponse.json({
      patients: Object.entries(PREVIEW_PATIENTS).map(([key, value]) => ({ key, labelEn: value.labelEn, labelBg: value.labelBg })),
      preview: complication ? cardPreview(complication, patient) : null,
    }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
