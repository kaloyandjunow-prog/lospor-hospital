import { NextRequest, NextResponse } from "next/server"

import { caseWriteWhereForUser } from "@/lib/access-control"
import { corsHeaders } from "@/lib/cors"
import { logAudit } from "@/lib/audit"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import {
  ehrReviewPlanFor,
  findPendingEhrImport,
  importIdentityCandidates,
  readUnreadSources,
} from "@/lib/hospital/ehr-import"
import { patientReference } from "@/lib/hospital/ehr-delivery-payload"
import { intraopLabsPlan } from "@/lib/hospital/ehr-intraop-labs"
import { assertEgnLinkingPermitted } from "@/lib/hospital/patient-identifier-policy"
import { ehrTransportAccess } from "@/lib/hospital/ehr-transport-policy"
import {
  ehrAuthConfigFor,
  forgetEhrAccessToken,
  resolveEhrAccessToken,
} from "@/lib/hospital/ehr-fhir-auth"
import { pullFhirImport, type FhirPullResult } from "@/lib/hospital/ehr-fhir-pull"
import type { ClinicalMode } from "@lospor/core/pediatric"
import type { PatientIdentifierType } from "@/generated/prisma/enums"

/**
 * Laboratory results drawn during the case, from the hospital system (1.4.13).
 *
 * The intraoperative labs ask again, during the operation, for what has been
 * drawn since the case started. Unlike the preoperative lookup this never
 * waits for a staged import: on a pulling transport it always asks the
 * hospital system, because what is already staged is the answer from before
 * the case, not the results drawn in it. A folder transport has nothing to
 * ask, so there the newest import waiting for the patient is read.
 *
 * The number to ask with is the case's own patient reference, decrypted here;
 * the screen never has it. The plan is built against the case's intraoperative
 * labs and narrowed to results drawn at or after the case start. Accepting
 * uses the ordinary case edit and the ordinary decision record
 * (POST /cases/:id/ehr-import), as the preoperative review does.
 */
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const headers = corsHeaders(req)
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })

  const existing = await prisma.case.findFirst({
    where: caseWriteWhereForUser(user, id),
    select: {
      id: true,
      institutionId: true,
      clinicalMode: true,
      intraop: { select: { startedAt: true, labResults: true } },
      patientLink: {
        select: {
          identifierType: true, identifierCiphertext: true, identifierNonce: true,
          identifierAuthTag: true, identifierHash: true, institutionId: true, keyVersion: true,
        },
      },
    },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404, headers })
  if (!existing.institutionId) {
    return NextResponse.json({ error: "This case has no institution", code: "NO_INSTITUTION" }, { status: 409, headers })
  }
  const startedAt = existing.intraop?.startedAt
  if (!startedAt) {
    return NextResponse.json({ error: "The case has not started", code: "CASE_NOT_STARTED" }, { status: 409, headers })
  }
  const patient = patientReference(existing.patientLink)
  if (!patient) {
    return NextResponse.json(
      { error: "The case has no patient number to ask with", code: "NO_PATIENT_REFERENCE" },
      { status: 409, headers },
    )
  }
  const identifierType = patient.identifierType as PatientIdentifierType
  if (identifierType === "EGN") {
    try {
      await assertEgnLinkingPermitted(prisma)
    } catch {
      return NextResponse.json(
        { error: "National identifiers are disabled for this site", code: "EGN_DISABLED_BY_POLICY" },
        { status: 409, headers },
      )
    }
  }

  let importId: string | null = null
  const access = await ehrTransportAccess()
  if (access.enabled && access.transport === "FHIR" && access.endpoint && access.credential) {
    const authConfig = ehrAuthConfigFor(access)
    const auth = await resolveEhrAccessToken(authConfig)
    if (!auth.ok) return NextResponse.json({ pending: false, code: auth.errorCode }, { status: 502, headers })
    const pulled = await pullFhirImport(prisma, {
      institutionId: existing.institutionId,
      restageFor: id,
      endpoint: access.endpoint,
      credential: auth.token,
      identifier: patient.identifier,
      identifierType,
      recordNumberSystem: access.recordNumberSystem,
      nationalIdentifierSystem: access.nationalIdentifierSystem,
    }).catch((): FhirPullResult => ({ ok: false, reason: "unreachable" }))
    if (pulled.ok) {
      importId = pulled.importId
    } else if (pulled.reason === "unreachable") {
      if (pulled.errorCode === "HTTP_401" || pulled.errorCode === "HTTP_403") forgetEhrAccessToken(authConfig)
      // Said as a failure: "nothing drawn" and "could not ask" lead to
      // different actions at the bedside.
      return NextResponse.json({ pending: false, code: pulled.errorCode ?? "EHR_UNREACHABLE" }, { status: 502, headers })
    } else if (pulled.reason === "wrong-identifier-system") {
      return NextResponse.json({ pending: false, code: "PATIENT_IDENTIFIER_SYSTEM_MISMATCH" }, { status: 409, headers })
    } else if (pulled.reason === "ambiguous") {
      return NextResponse.json({ pending: false, code: "PATIENT_AMBIGUOUS" }, { status: 409, headers })
    }
  } else if (access.enabled) {
    const pending = await findPendingEhrImport(prisma, {
      institutionId: existing.institutionId,
      identifier: patient.identifier,
      identifierType,
    })
    importId = pending?.id ?? null
  } else {
    return NextResponse.json({ pending: false, code: "EHR_IMPORT_DISABLED" }, { status: 409, headers })
  }
  if (!importId) return NextResponse.json({ pending: false }, { status: 200, headers })

  const labResults = Array.isArray(existing.intraop?.labResults) ? existing.intraop.labResults : []
  const built = await ehrReviewPlanFor(prisma, {
    importId,
    institutionId: existing.institutionId,
    current: { labResults },
    currentClinicalMode: existing.clinicalMode as ClinicalMode | null,
    identifierHashes: importIdentityCandidates(
      existing.institutionId, identifierType, patient.identifier, new Date(),
    ).map(identity => identity.identifierHash),
  })
  if (!built) return NextResponse.json({ pending: false }, { status: 200, headers })

  const plan = intraopLabsPlan(built.plan, startedAt)
  if (plan.items.length === 0) return NextResponse.json({ pending: false }, { status: 200, headers })

  // The same warnings the preoperative review carries: an unchecked identity
  // and the groups that could not be read change what the results are worth.
  const stored = await prisma.ehrImport.findUnique({
    where: { id: importId },
    select: { identityUnverified: true, unreadSources: true, receivedAt: true },
  })

  await logAudit(user.id, "EHR_IMPORT_VIEWED", id, { importId, items: plan.items.length, scope: "intraop-labs" })
  return NextResponse.json(
    {
      pending: true,
      importId,
      maskedIdentifier: built.maskedIdentifier,
      identityUnverified: stored?.identityUnverified === true,
      unreadSources: readUnreadSources(stored?.unreadSources),
      receivedAt: stored?.receivedAt ?? null,
      plan,
    },
    { status: 200, headers },
  )
}
