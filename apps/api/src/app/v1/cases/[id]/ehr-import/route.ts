import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { caseWriteWhereForUser } from "@/lib/access-control"
import { corsHeaders } from "@/lib/cors"
import { logAudit } from "@/lib/audit"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import {
  EhrImportError,
  ehrReviewPlanFor,
  findPendingEhrImport,
  recordEhrDecisions,
} from "@/lib/hospital/ehr-import"
import { assertEgnLinkingPermitted } from "@/lib/hospital/patient-identifier-policy"
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

  const pending = await findPendingEhrImport(prisma, {
    institutionId: existing.institutionId,
    identifier: parsed.data.identifier,
    identifierType: parsed.data.identifierType,
  })
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
    const result = await recordEhrDecisions(prisma, {
      importId: parsed.data.importId,
      institutionId: existing.institutionId,
      acceptedKeys: parsed.data.acceptedKeys,
      declinedKeys: parsed.data.declinedKeys,
      userId: user.id,
    })

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
