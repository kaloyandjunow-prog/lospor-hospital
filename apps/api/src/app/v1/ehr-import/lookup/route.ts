import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { corsHeaders } from "@/lib/cors"
import { logAudit } from "@/lib/audit"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import {
  ehrReviewPlanFor,
  findPendingEhrImport,
  importIdentityCandidates,
} from "@/lib/hospital/ehr-import"
import { assertEgnLinkingPermitted } from "@/lib/hospital/patient-identifier-policy"
import { ehrTransportAccess } from "@/lib/hospital/ehr-transport-policy"
import { pullFhirImport, type FhirPullResult } from "@/lib/hospital/ehr-fhir-pull"
import {
  ehrAuthConfigFor,
  resolveEhrAccessToken,
} from "@/lib/hospital/ehr-fhir-auth"

/**
 * Ask the hospital system about a patient before a case exists.
 *
 * The case-scoped route is the one that records decisions, and it stays that
 * way. This one only asks, because asking came first and could not happen.
 *
 * A record number is the first thing typed on a new case and the only thing
 * the hospital needs to answer. But the lookup hung off a saved case, a case
 * cannot be saved without an age, a height and a weight, and so the clinician
 * had to fill in three fields they were about to be told before anything could
 * be fetched. The button reported "the draft could not be saved", which is
 * true and explains nothing.
 *
 * What the case was actually providing here is an institution and the right to
 * write clinical data, and the signed-in user carries both. It is not a
 * consent anchor -- unlike the AI routes, nothing here reads consent off the
 * stored case -- so nothing is weakened by taking it from the account instead.
 *
 * Staging is scoped to the user rather than a case, so a clinician who looks
 * the same patient up twice before saving anything gets one import rather than
 * a new one each time.
 */

const querySchema = z.object({
  identifier: z.string().trim().min(1).max(128),
  identifierType: z.enum(["IZ", "EGN"]),
})

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders(req) })
  }

  // No institution, no hospital system to ask. The case-scoped route says the
  // same thing about a case with no institution.
  if (!user.institutionId) {
    return NextResponse.json(
      { error: "This account has no institution", code: "NO_INSTITUTION" },
      { status: 409, headers: corsHeaders(req) },
    )
  }
  const institutionId = user.institutionId

  const parsed = querySchema.safeParse({
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
  // patient up by one here either, or the policy only covers the other door.
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

  const scope = `user:${user.id}`
  let pending = await findPendingEhrImport(prisma, {
    institutionId,
    identifier: parsed.data.identifier,
    identifierType: parsed.data.identifierType,
  })

  if (!pending) {
    const access = await ehrTransportAccess()
    if (access.enabled && access.transport === "FHIR" && access.endpoint && access.credential) {
      const auth = await resolveEhrAccessToken(ehrAuthConfigFor(access))
      if (!auth.ok) {
        // Not reported as an empty record: a clinician told the hospital holds
        // nothing concludes the patient has no history, which is a different
        // and worse statement than "we could not authenticate".
        return NextResponse.json(
          { pending: false, code: auth.errorCode },
          { status: 502, headers: corsHeaders(req) },
        )
      }
      const pulled = await pullFhirImport(prisma, {
        institutionId,
        endpoint: access.endpoint,
        credential: auth.token,
        identifier: parsed.data.identifier,
        identifierType: parsed.data.identifierType,
        recordNumberSystem: access.recordNumberSystem,
        nationalIdentifierSystem: access.nationalIdentifierSystem,
        restageFor: scope,
      }).catch((): FhirPullResult => ({ ok: false, reason: "unreachable" }))

      if (pulled.ok) {
        pending = await findPendingEhrImport(prisma, {
          institutionId,
          identifier: parsed.data.identifier,
          identifierType: parsed.data.identifierType,
        })
      } else if (pulled.reason === "ambiguous") {
        // More than one patient carries this number. Attaching either one's
        // history to a case would be attaching a stranger's.
        return NextResponse.json(
          { pending: false, code: "ambiguous" },
          { status: 409, headers: corsHeaders(req) },
        )
      } else if (pulled.reason === "unreachable") {
        return NextResponse.json(
          { pending: false, code: "unreachable" },
          { status: 502, headers: corsHeaders(req) },
        )
      }
    }
  }

  if (!pending) {
    return NextResponse.json({ pending: false }, { status: 200, headers: corsHeaders(req) })
  }

  // Nothing is in the case yet, so nothing can conflict and no clinical mode
  // is set: every proposal is offered as new.
  const built = await ehrReviewPlanFor(prisma, {
    importId: pending.id,
    institutionId,
    current: {},
    currentClinicalMode: null,
    identifierHashes: importIdentityCandidates(
      institutionId,
      parsed.data.identifierType,
      parsed.data.identifier,
      new Date(),
    ).map(identity => identity.identifierHash),
  })
  if (!built) {
    return NextResponse.json({ pending: false }, { status: 200, headers: corsHeaders(req) })
  }

  // Audited against the import, because there is no case to name yet. The
  // decisions that follow are audited against the case, once one exists.
  await logAudit(user.id, "EHR_IMPORT_VIEWED", pending.id, {
    importId: pending.id,
    items: built.plan.items.length,
  })

  return NextResponse.json(
    {
      pending: true,
      importId: pending.id,
      maskedIdentifier: built.maskedIdentifier,
      identityUnverified: pending.identityUnverified,
      unreadSources: pending.unread,
      receivedAt: pending.receivedAt,
      plan: built.plan,
    },
    { status: 200, headers: corsHeaders(req) },
  )
}
