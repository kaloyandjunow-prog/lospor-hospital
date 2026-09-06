import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { caseWriteWhereForUser } from "@/lib/access-control"
import { corsHeaders } from "@/lib/cors"
import { logAudit } from "@/lib/audit"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { serializableTransaction } from "@/lib/account-lifecycle"
import {
  EhrImportError,
  ehrReviewPlanFor,
  findPendingEhrImport,
  importIdentityCandidates,
  recordEhrDecisions,
} from "@/lib/hospital/ehr-import"
import { assertEgnLinkingPermitted } from "@/lib/hospital/patient-identifier-policy"
import { ehrTransportAccess } from "@/lib/hospital/ehr-transport-policy"
import { pullFhirImport, type FhirPullResult } from "@/lib/hospital/ehr-fhir-pull"
import {
  ehrAuthConfigFor,
  forgetEhrAccessToken,
  resolveEhrAccessToken,
} from "@/lib/hospital/ehr-fhir-auth"
import type { ClinicalMode } from "@lospor/core/pediatric"

/**
 * What the hospital system sent for this patient, and what the clinician did
 * about it.
 *
 * GET returns a review plan — a set of proposals, none of which is in the
 * record. POST records decisions **after** the client has applied the accepted
 * values through the ordinary case PATCH. That order is deliberate: a failure
 * between the two leaves the import pending and self-corrects, because a value
 * already in the case comes back `unchanged`. Recording first would mark an
 * item decided that never reached the record.
 *
 * Nothing on this route writes a clinical value.
 */

const decisionsSchema = z.object({
  importId: z.string().trim().min(1).max(64),
  acceptedKeys: z.array(z.string().trim().min(1).max(512)).max(500).default([]),
  declinedKeys: z.array(z.string().trim().min(1).max(512)).max(500).default([]),
})

const identifierSchema = z.object({
  identifier: z.string().trim().min(1).max(64),
  identifierType: z.enum(["IZ", "EGN"]).default("IZ"),
})

/** The preop values a plan is compared against, by canonical field name. */
function currentPreop(preop: Record<string, unknown> | null | undefined) {
  return (preop ?? {}) as Record<string, unknown>
}

async function resolveCase(req: NextRequest, id: string) {
  const user = await getAuthUser(req)
  if (!user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const existing = await prisma.case.findFirst({
    where: caseWriteWhereForUser(user, id),
    select: { id: true, institutionId: true, clinicalMode: true, preop: true },
  })
  if (!existing) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) }

  // An import belongs to an institution, because that is what its identifier
  // is scoped to — ИЗ № 42 means nothing without knowing whose 42 it is. A
  // case with no institution therefore has no hospital system to ask.
  if (!existing.institutionId) {
    return {
      error: NextResponse.json(
        { error: "This case has no institution", code: "NO_INSTITUTION" },
        { status: 409 },
      ),
    }
  }

  return { user, existing: { ...existing, institutionId: existing.institutionId } }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const resolved = await resolveCase(req, id)
  if ("error" in resolved) return resolved.error
  const { user, existing } = resolved

  const parsed = identifierSchema.safeParse({
    identifier: req.nextUrl.searchParams.get("identifier") ?? "",
    identifierType: req.nextUrl.searchParams.get("identifierType") ?? "IZ",
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: "An identifier is required", code: "INVALID_IDENTIFIER" },
      { status: 400, headers: corsHeaders(req) },
    )
  }

  // A site that has turned national identifiers off must not be able to look a
  // patient up by one either — otherwise the policy only covers writing.
  if (parsed.data.identifierType === "EGN") {
    try {
      await assertEgnLinkingPermitted(prisma)
    } catch {
      return NextResponse.json(
        { error: "National identifiers are disabled for this site", code: "EGN_DISABLED_BY_POLICY" },
        { status: 409, headers: corsHeaders(req) },
      )
    }
  }

  let pending = await findPendingEhrImport(prisma, {
    institutionId: existing.institutionId,
    identifier: parsed.data.identifier,
    identifierType: parsed.data.identifierType,
  })

  // Nothing staged. On a pulling transport that is not an answer yet: folder
  // drop waits for the hospital to write a file, but FHIR only ever produces
  // anything because we asked, so this is the moment to ask. The request stays
  // open while the server answers, which is the design the clinician sees as
  // typing a number and getting a reply.
  if (!pending) {
    const access = await ehrTransportAccess()
    if (access.enabled && access.transport === "FHIR" && access.endpoint && access.credential) {
      // A bearer token, obtained the way the delivery path obtains one.
      //
      // This used to pass `access.credential` straight through -- which under
      // OAuth is the *client secret*, not a token. Two consequences, both bad:
      // the hospital's server rejected it, so typing a record number returned
      // nothing at every site using client credentials; and the long-lived
      // secret was sent in an Authorization header to a resource server that
      // should only ever see short-lived tokens, landing in its access log.
      const authConfig = ehrAuthConfigFor(access)
      const auth = await resolveEhrAccessToken(authConfig)
      if (!auth.ok) {
        // Said out loud rather than reported as an empty record: a clinician
        // told the hospital holds nothing concludes the patient has no
        // history, which is a different and worse statement than "we could
        // not authenticate".
        return NextResponse.json(
          { pending: false, code: auth.errorCode },
          { status: 502, headers: corsHeaders(req) },
        )
      }
      // A thrown error becomes the same answer a refused connection gives.
      // What it must not become is `null`, which used to fall through to
      // "the hospital holds nothing for this patient" -- a clinician told
      // that concludes the patient has no history, which is a different and
      // worse statement than "we could not ask".
      const pulled = await pullFhirImport(prisma, {
        institutionId: existing.institutionId,
        endpoint: access.endpoint,
        credential: auth.token,
        identifier: parsed.data.identifier,
        identifierType: parsed.data.identifierType,
        recordNumberSystem: access.recordNumberSystem,
      }).catch((): FhirPullResult => ({ ok: false, reason: "unreachable" }))

      if (pulled.ok) {
        pending = await findPendingEhrImport(prisma, {
          institutionId: existing.institutionId,
          identifier: parsed.data.identifier,
          identifierType: parsed.data.identifierType,
        })
      } else if (!pulled.ok && pulled.reason === "wrong-identifier-system") {
        // One patient carried this number, under a different numbering from
        // the one this site configured. That is what a wrong-patient import
        // looks like from here -- a clean single hit -- so it is refused and
        // named. Either the number was mistyped or the configured system is
        // wrong, and an operator can act on both.
        return NextResponse.json(
          { pending: false, code: "PATIENT_IDENTIFIER_SYSTEM_MISMATCH" },
          { status: 409, headers: corsHeaders(req) },
        )
      } else if (!pulled.ok && pulled.reason === "unreachable") {
        // A token can stop working before it expires. Forgetting it here is
        // what stops the appliance replaying a dead one for the rest of its
        // lifetime, failing every lookup in between.
        if (pulled.errorCode === "HTTP_401" || pulled.errorCode === "HTTP_403") {
          forgetEhrAccessToken(authConfig)
        }
        // The hospital system did not answer. Reported as a failure rather
        // than as an empty result: the clinician needs to know the question
        // was never asked, so they go and look the values up themselves
        // instead of documenting a patient as having no history.
        return NextResponse.json(
          { pending: false, code: pulled.errorCode ?? "EHR_UNREACHABLE" },
          { status: 502, headers: corsHeaders(req) },
        )
      } else if (!pulled.ok && pulled.reason === "ambiguous") {
        // Two patients answered to one record number. Resolving that by picking
        // one would attach a stranger's history to this case, so it is refused
        // and said out loud instead.
        return NextResponse.json(
          { pending: false, code: "PATIENT_AMBIGUOUS" },
          { status: 409, headers: corsHeaders(req) },
        )
      }
    }
  }

  if (!pending) {
    return NextResponse.json(
      { pending: false },
      { status: 200, headers: corsHeaders(req) },
    )
  }

  const built = await ehrReviewPlanFor(prisma, {
    importId: pending.id,
    institutionId: existing.institutionId,
    current: currentPreop(existing.preop as Record<string, unknown> | null),
    currentClinicalMode: existing.clinicalMode as ClinicalMode | null,
    // A refusal recorded before New Year sits under a different scope from an
    // import staged after it. This is the only place that still has the number
    // the clinician typed, so it is the only place that can bridge them.
    identifierHashes: importIdentityCandidates(
      existing.institutionId,
      parsed.data.identifierType,
      parsed.data.identifier,
      new Date(),
    ).map(identity => identity.identifierHash),
  })
  if (!built) {
    return NextResponse.json(
      { pending: false },
      { status: 200, headers: corsHeaders(req) },
    )
  }

  // The actor is the hospital system, not this clinician: they are reading what
  // it proposed, and the provenance has to say so.
  await logAudit(user.id, "EHR_IMPORT_VIEWED", id, {
    importId: pending.id,
    items: built.plan.items.length,
  })

  return NextResponse.json(
    {
      pending: true,
      importId: pending.id,
      maskedIdentifier: built.maskedIdentifier,
      // The clinician is about to accept a proposed allergy list. Whether the
      // patient it came from was actually verified is part of what that
      // decision rests on.
      identityUnverified: pending.identityUnverified,
    // Groups the hospital system could not be read for. Sent even though the
    // import succeeded: what is missing changes how much the rest is worth.
    unreadSources: pending.unread,
      receivedAt: pending.receivedAt,
      plan: built.plan,
    },
    { status: 200, headers: corsHeaders(req) },
  )
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const resolved = await resolveCase(req, id)
  if ("error" in resolved) return resolved.error
  const { user, existing } = resolved

  const parsed = decisionsSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "importId and decision lists are required", code: "INVALID_DECISIONS" },
      { status: 400, headers: corsHeaders(req) },
    )
  }

  try {
    // One transaction, because the five statements inside describe one act.
    // Serializable rather than the default: two clinicians reviewing the same
    // import, or a client retrying, must not interleave into a half-recorded
    // decision — and the closing step reads the remaining count that the two
    // writes just changed.
    const result = await prisma.$transaction(async tx => recordEhrDecisions(tx, {
      importId: parsed.data.importId,
      institutionId: existing.institutionId,
      acceptedKeys: parsed.data.acceptedKeys,
      declinedKeys: parsed.data.declinedKeys,
      userId: user.id,
    }), serializableTransaction)

    await logAudit(user.id, "EHR_IMPORT_REVIEWED", id, {
      importId: parsed.data.importId,
      accepted: result.accepted,
      declined: result.declined,
      closed: result.closed,
    })

    return NextResponse.json(result, { status: 200, headers: corsHeaders(req) })
  } catch (error) {
    if (error instanceof EhrImportError) {
      return NextResponse.json(
        { error: "Import not found", code: error.code },
        { status: 404, headers: corsHeaders(req) },
      )
    }
    throw error
  }
}
