import { NextResponse } from "next/server"
import {
  preopSectionsUpdateSchema,
  updateHospitalPreopSections,
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
    const input = preopSectionsUpdateSchema.parse(await boundedJson(request))
    const sections = await updateHospitalPreopSections(input)
    return NextResponse.json(sections ?? { ok: true }, { status: 201, headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
