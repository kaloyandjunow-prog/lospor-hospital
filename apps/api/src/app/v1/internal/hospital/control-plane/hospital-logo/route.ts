import { NextResponse } from "next/server"
import { hospitalLogoSchema } from "@/lib/hospital/hospital-logo"
import { readHospitalLogo, setHospitalLogo } from "@/lib/hospital/control-plane"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"

// The picture is read on its own, so the overview that Status polls stays small.
export async function GET(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const institutionId = new URL(request.url).searchParams.get("institutionId") ?? ""
    return NextResponse.json({ logoDataUrl: await readHospitalLogo(institutionId) }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export async function POST(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const input = hospitalLogoSchema.parse(await boundedJson(request, 400 * 1024))
    const institution = await setHospitalLogo(input)
    return NextResponse.json({ institutionId: institution.id, configured: institution.logoDataUrl !== null }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
