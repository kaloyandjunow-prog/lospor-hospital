import { NextRequest, NextResponse, after } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { mapPreop, mapIntraop, mapPostop } from "./_mappers"
import { logAudit } from "@/lib/audit"
import { preopSchema, intraopSchema, postopSchema } from "@/lib/schemas/case"
import { parseLenient, type RejectedField } from "@/lib/lenient-parse"
import { checkClinicalPayloadPII, piiErrorBody } from "@/lib/clinical-pii"
import { syncCaseRelationalLockedSafe } from "@/lib/relational-sync"
import { caseWhereForUser } from "@/lib/access-control"
import { generateCaseCode, isPrismaUniqueError } from "@/lib/case-code"
import { corsHeaders } from "@/lib/cors"
import { resolvePatientLink } from "@/lib/hospital/patient-link"
import { z } from "zod"
import { emitStatusEvent } from "@/lib/hospital/status-events"
import { decidePediatricWrite } from "@/lib/pediatric-mode"
import { withDirectTransaction } from "@/lib/clinical-transaction"

const CORS = (req: NextRequest) => corsHeaders(req)

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: CORS(req) })
}

async function findIdempotentCase(userId: string, idempotencyKey: string) {
  return prisma.case.findFirst({
    where: { createdById: userId, clientDraftId: idempotencyKey },
    select: {
      id: true,
      caseCode: true,
      patientLink: { select: { id: true, maskedIdentifier: true } },
      preop: { select: { updatedAt: true, syncRevision: true } },
    },
  })
}


export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id

  // An offline mobile draft is permanently bound to the account and hospital
  // under which it was recorded. If that clinician is transferred while the
  // device is offline, silently creating it in their new hospital is a
  // wrong-institution clinical write. Hospital mobile clients must echo the
  // immutable draft institution; Web sessions do not create offline drafts.
  if (
    process.env.LOSPOR_DEPLOYMENT_MODE === "hospital"
    && req.headers.get("x-lospor-client") === "mobile"
  ) {
    const expectedInstitutionId = req.headers.get("x-lospor-expected-institution")
    if (!expectedInstitutionId || expectedInstitutionId !== user.institutionId) {
      return NextResponse.json({
        error: "Your hospital context changed. Sign in again before syncing this draft.",
        code: "INSTITUTION_CONTEXT_CHANGED",
      }, { status: 409 })
    }
  }

  try {
    const body = await req.json()
    if (!body.preop) return NextResponse.json({ error: "preop required" }, { status: 400 })

    // Idempotency: mobile sends X-Idempotency-Key (= localDraftId) on case creation.
    // If we find an existing case with this key, return it without creating a duplicate.
    const idempotencyKey = req.headers.get("x-idempotency-key")
    if (idempotencyKey) {
      const existing = await findIdempotentCase(userId, idempotencyKey)
      if (existing) {
        return NextResponse.json({
          id: existing.id,
          caseCode: existing.caseCode,
          patientReference: existing.patientLink,
          preopUpdatedAt: existing.preop?.updatedAt,
          preopRevision: existing.preop?.syncRevision,
        }, { status: 200 })
      }
    }

    // Lenient, exactly like PATCH. Creating a case is an autosave-style partial
    // write — the first draft save — and it used to be strict: one out-of-range
    // value (a height still being dragged past 12 cm) threw, the whole request
    // 400'd, and no case row was written at all. With no case id there was no
    // draft to return to, so leaving the screen destroyed the entire assessment.
    // Now the offending field is dropped and named, and everything else is kept.
    //
    // Finalising a case still uses a strict parse — that is where completeness
    // has to be enforced.
    const rejectedFields: RejectedField[] = []
    const takeRejected = (section: "preop" | "intraop" | "postop", rejected: RejectedField[]) => {
      // Prefix the section so one client mapper handles POST and PATCH alike.
      for (const r of rejected) rejectedFields.push({ ...r, path: `${section}.${r.path}` })
    }

    const preopParsed = parseLenient(preopSchema, body.preop)
    takeRejected("preop", preopParsed.rejected)
    const preop = preopParsed.value
    const clinicalMode = body.clinicalMode === "PEDIATRIC"
      ? "PEDIATRIC"
      : body.clinicalMode == null || body.clinicalMode === "ADULT"
        ? "ADULT"
        : null
    if (!clinicalMode) {
      return NextResponse.json({ error: "Invalid clinical mode" }, { status: 400 })
    }
    const pediatricDecision = decidePediatricWrite({
      clinicalMode,
      preop,
      clientVersion: req.headers.get("x-lospor-client-version"),
      enforceAgeDecision: true,
      allowIncompleteAge: true,
    })
    if (!pediatricDecision.allowed) {
      return NextResponse.json({
        error: pediatricDecision.code,
        ...pediatricDecision,
      }, { status: pediatricDecision.status })
    }
    const mappedPreop = { ...preop, clinicalMode: pediatricDecision.clinicalMode }

    let intraop: z.infer<typeof intraopSchema> | undefined
    if (body.intraop) {
      const p = parseLenient(intraopSchema, body.intraop)
      takeRejected("intraop", p.rejected)
      intraop = p.value
    }

    let postop: z.infer<typeof postopSchema> | undefined
    if (body.postop) {
      const p = parseLenient(postopSchema, body.postop)
      takeRejected("postop", p.rejected)
      postop = p.value
    }

    if (rejectedFields.length) {
      // Paths only — the values are clinical data and must not reach the logs.
      console.warn("[cases] CASE_CREATE_FIELDS_REJECTED")
    }

    const piiError = checkClinicalPayloadPII({ preop, intraop, postop, notes: body.notes })
    if (piiError) {
      after(() => logAudit(userId, "PII_BLOCKED", "new", {
        field: piiError.field,
        reasonCode: piiError.reason,
      }))
      return NextResponse.json(piiErrorBody(piiError), { status: 400 })
    }

    const status = postop ? "AWAITING_REVIEW" : intraop ? "IN_PROGRESS" : "DRAFT"
    const patientNumber = body.patientNumber
    if (patientNumber != null && typeof patientNumber !== "string") {
      return NextResponse.json({ error: "patientNumber must be a string" }, { status: 400 })
    }
    const patientNumberRequired = process.env.HOSPITAL_REQUIRE_PATIENT_NUMBER === "true"
    if (patientNumberRequired && (!patientNumber || !patientNumber.trim())) {
      return NextResponse.json({ error: "Patient number is required" }, { status: 400 })
    }
    if (patientNumber && !user.institutionId) {
      return NextResponse.json({
        error: "An institution is required before a patient number can be linked",
      }, { status: 400 })
    }
    let caseRecord
    for (let attempt = 0; ; attempt++) {
      try {
        // The encrypted identifier and its case are one clinical write. A
        // failed case create must never leave an identifiable orphan row.
        caseRecord = await withDirectTransaction(async tx => {
          const patientReference = patientNumber && user.institutionId
            ? await resolvePatientLink(tx, user.institutionId, patientNumber, userId)
            : null
          return tx.case.create({
            data: {
              clinicalMode: pediatricDecision.clinicalMode,
              clinicalRulesVersion: pediatricDecision.clinicalRulesVersion,
              userId,
              createdById: userId,
              status,
              institutionId: user.institutionId ?? null,
              patientLinkId: patientReference?.id ?? null,
              caseCode: await generateCaseCode(userId, tx),
              ...(idempotencyKey ? { clientDraftId: idempotencyKey } : {}),
              preop: { create: { ...mapPreop(mappedPreop), syncRevision: 1 } },
              ...(intraop ? { intraop: { create: { ...mapIntraop(intraop), syncRevision: 1 } } } : {}),
              ...(postop  ? { postop:  { create: { ...mapPostop(postop), syncRevision: 1 } } } : {}),
            },
            include: {
              patientLink: { select: { id: true, maskedIdentifier: true } },
              preop: { select: { updatedAt: true, syncRevision: true } },
            },
          })
        })
        break
      } catch (e: unknown) {
        if (idempotencyKey && isPrismaUniqueError(e, "clientDraftId")) {
          const existing = await findIdempotentCase(userId, idempotencyKey)
          if (existing) {
            return NextResponse.json({
              id: existing.id,
              caseCode: existing.caseCode,
              patientReference: existing.patientLink,
              preopUpdatedAt: existing.preop?.updatedAt,
              preopRevision: existing.preop?.syncRevision,
            }, { status: 200 })
          }
        }
        // Concurrent requests can compute the same next caseCode — retry with a
        // freshly-generated one rather than failing the whole create.
        if (isPrismaUniqueError(e, "caseCode") && attempt < 4) continue
        throw e
      }
    }

    after(() => logAudit(userId, "CASE_CREATE", caseRecord.id))
    after(() => syncCaseRelationalLockedSafe(caseRecord.id, userId))
    return NextResponse.json({
      id: caseRecord.id,
      clinicalMode: pediatricDecision.clinicalMode,
      clinicalRulesVersion: pediatricDecision.clinicalRulesVersion,
      caseCode: caseRecord.caseCode,
      patientReference: caseRecord.patientLink,
      preopUpdatedAt: caseRecord.preop?.updatedAt,
      preopRevision: caseRecord.preop?.syncRevision,
      ...(rejectedFields.length ? { rejectedFields } : {}),
    }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    console.error("[cases] CLINICAL_WRITE_FAILED case-create")
    void emitStatusEvent("CLINICAL_WRITE_FAILED", { operation: "case-create" })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const where = caseWhereForUser(user)

  // Item 28: Pagination — accept optional ?skip and ?take; cap take at 200 per request
  const url = new URL(req.url)
  const skipRaw = Number(url.searchParams.get("skip") ?? "0")
  const skip = Number.isFinite(skipRaw) ? Math.max(0, skipRaw) : 0
  const takeRaw = Number(url.searchParams.get("take") ?? "50")
  // Number("abc") is NaN, and Math.min/max propagate it straight into Prisma,
  // which throws — a 500 from a malformed query string.
  const take = Number.isFinite(takeRaw) ? Math.min(200, Math.max(1, takeRaw)) : 50

  const [cases, total] = await Promise.all([
    prisma.case.findMany({
      where,
      include: {
        preop:  { select: { diagnosis: true, plannedProcedure: true, ageYears: true, ageValue: true, ageUnit: true, sex: true, asaScore: true } },
        postop: { select: { disposition: true, aldreteTotal: true } },
        intraop: { select: { monthYear: true, durationMinutes: true, endTime: true } },
        user: { select: { name: true } },
        patientLink: { select: { id: true, maskedIdentifier: true } },
        transfers: {
          where: { status: "PENDING" },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.case.count({ where }),
  ])

  return NextResponse.json({ cases, total, skip, take })
}
