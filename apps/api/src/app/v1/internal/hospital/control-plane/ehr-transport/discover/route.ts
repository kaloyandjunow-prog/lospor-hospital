import { NextResponse } from "next/server"
import { z } from "zod"

import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"
import { ehrAuthConfigFor, resolveEhrAccessToken } from "@/lib/hospital/ehr-fhir-auth"
import {
  discoverFhirCapabilities,
  probeFhirIdentifierSystems,
} from "@/lib/hospital/ehr-fhir-discovery"
import { ehrTransportAccess } from "@/lib/hospital/ehr-transport-policy"

const schema = z.object({
  /**
   * A record number to look up, so the probe can report the numberings a real
   * response actually carried.
   *
   * Optional: without one the capability statement is still worth having, and a
   * site should be able to test that its endpoint answers at all before it has
   * a patient to look up.
   */
  identifier: z.string().trim().min(1).max(64).optional(),
}).strict()

/**
 * Ask the hospital's server what it is and which numberings it uses.
 *
 * Nobody can recall an OID. An operator asked to type one goes to their vendor
 * and the integration stalls for a fortnight; an operator shown the three
 * systems that came back in a real response recognises their own admission
 * number immediately. That is the whole reason this exists, and it is the same
 * recognition-over-recall shape the laboratory code map uses.
 *
 * Read-only and stores nothing. What comes back is offered on the screen; the
 * operator chooses, and the choice goes through the identifier-systems route
 * with a password and a reason like any other configuration change.
 *
 * The identifier is not stored, logged, or echoed back — only the systems it
 * was found under are.
 */
export async function POST(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const { identifier } = schema.parse(await boundedJson(request))

    const access = await ehrTransportAccess()
    if (!access.enabled || access.transport !== "FHIR" || !access.endpoint) {
      return NextResponse.json(
        { error: "No FHIR endpoint is configured", code: "ENDPOINT_NOT_CONFIGURED" },
        { status: 409, headers: ACCOUNT_CONTROL_HEADERS },
      )
    }

    // The same bearer the real pull would use, so a probe that succeeds means
    // the real thing will too. A probe authenticated differently would be a
    // test of something the appliance never does.
    const auth = await resolveEhrAccessToken(ehrAuthConfigFor(access))
    if (!auth.ok) {
      return NextResponse.json(
        { error: "Could not authenticate", code: auth.errorCode },
        { status: 502, headers: ACCOUNT_CONTROL_HEADERS },
      )
    }

    const capabilities = await discoverFhirCapabilities({
      endpoint: access.endpoint,
      credential: auth.token,
    })

    const probe = identifier
      ? await probeFhirIdentifierSystems({
          endpoint: access.endpoint,
          credential: auth.token,
          identifier,
        })
      : null

    return NextResponse.json({
      capabilities,
      identifierSystems: probe?.identifierSystems ?? [],
      // Said plainly rather than left to be inferred from an empty list: a
      // server that answered about a patient it does not have is a different
      // situation from one that could not be asked.
      patientFound: probe ? probe.found : null,
      probeErrorCode: probe && !probe.found ? probe.errorCode ?? null : null,
    }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
