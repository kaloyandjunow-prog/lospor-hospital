import { NextResponse } from "next/server"
import {
  patientIdentifierPolicySchema,
  setPatientIdentifierPolicy,
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
    const input = patientIdentifierPolicySchema.parse(await boundedJson(request))
    const policy = await setPatientIdentifierPolicy(input)
    return NextResponse.json({
      egnPermitted: policy.egnPermitted,
      changedAt: policy.changedAt,
    }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
