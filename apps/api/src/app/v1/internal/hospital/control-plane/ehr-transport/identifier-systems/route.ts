import { NextResponse } from "next/server"
import {
  ehrNationalIdentifierSystemSchema,
  ehrRecordNumberSystemSchema,
  setEhrNationalIdentifierSystem,
  setEhrRecordNumberSystem,
} from "@/lib/hospital/control-plane"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"

/**
 * Which of the hospital's numberings its record numbers and ЕГН values live in.
 *
 * Both on one route because an operator sets them in one sitting, from one
 * screen, looking at one list of what a real response carried. Two routes would
 * mean two password prompts and two reasons for a single decision.
 *
 * Until a site answers these, a patient search is verified against nothing: the
 * match is returned marked unverified rather than refused, because a site has
 * to be able to work before it has seen enough real traffic to answer. Once
 * answered, a value found in the wrong numbering is refused the way an
 * ambiguous match is -- which is what stops a stranger's allergy list being
 * proposed onto a case on the strength of two patients sharing a number.
 *
 * A body may carry either field or both. Omitting one leaves it as it was
 * rather than clearing it, so setting the record number does not silently
 * unconfigure ЕГН.
 */
export async function POST(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const body = await boundedJson(request) as Record<string, unknown>
    const reason = body.reason

    // Neither field present is a request that means nothing. Refused rather
    // than treated as a no-op, because the likeliest cause is a client sending
    // the wrong shape and quietly succeeding would hide it.
    const setsRecord = "recordNumberSystem" in body
    const setsNational = "nationalIdentifierSystem" in body
    if (!setsRecord && !setsNational) {
      return NextResponse.json(
        { error: "Nothing to set", code: "NO_IDENTIFIER_SYSTEM_SUPPLIED" },
        { status: 400, headers: ACCOUNT_CONTROL_HEADERS },
      )
    }

    let recordNumberSystem: string | null = null
    let nationalIdentifierSystem: string | null = null

    if (setsRecord) {
      const policy = await setEhrRecordNumberSystem(ehrRecordNumberSystemSchema.parse({
        recordNumberSystem: body.recordNumberSystem, reason,
      }))
      recordNumberSystem = policy.recordNumberSystem
      nationalIdentifierSystem = policy.nationalIdentifierSystem
    }
    if (setsNational) {
      const policy = await setEhrNationalIdentifierSystem(ehrNationalIdentifierSystemSchema.parse({
        nationalIdentifierSystem: body.nationalIdentifierSystem, reason,
      }))
      recordNumberSystem = policy.recordNumberSystem
      nationalIdentifierSystem = policy.nationalIdentifierSystem
    }

    return NextResponse.json(
      { recordNumberSystem, nationalIdentifierSystem },
      { headers: ACCOUNT_CONTROL_HEADERS },
    )
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
