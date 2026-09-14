import { NextResponse } from "next/server"
import { answerEhrCodeSystem, ehrCodeSystemAnswerSchema } from "@/lib/hospital/control-plane"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"

/**
 * Say which code list one of this hospital's coding-system addresses stands
 * for, or take the answer back with a null list.
 */
export async function POST(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const body = await boundedJson(request) as Record<string, unknown>
    const input = ehrCodeSystemAnswerSchema.parse({ system: body.system, list: body.list ?? null })
    return NextResponse.json(await answerEhrCodeSystem(input), { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
