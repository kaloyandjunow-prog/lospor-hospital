import { NextResponse } from "next/server"
import { labScanSettingsSchema, setLabScanSettings } from "@/lib/hospital/control-plane"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"
import { labScanControlView } from "@/lib/hospital/lab-scan-settings"

/** Save the lab scan's local names and note (1.9.1); audited, with a reason. */
export async function POST(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    // 300 names of up to 80 characters and a 1,500-character note, in Cyrillic.
    const input = labScanSettingsSchema.parse(await boundedJson(request, 262_144))
    const policy = await setLabScanSettings(input)
    return NextResponse.json(labScanControlView(policy), { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
