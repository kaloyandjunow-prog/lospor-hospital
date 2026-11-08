import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { corsHeaders } from "@/lib/cors"
import { getAuthUser } from "@/lib/mobile-auth"
import { caseWriteWhereForUser } from "@/lib/access-control"
import { CaseWriteError, withLockedCaseTransaction } from "@/lib/clinical-transaction"
import { isHospitalDeployment } from "@/lib/hospital/deployment"
import { resolvePatientLink } from "@/lib/hospital/patient-link"
import { isValidEgn } from "@/lib/hospital/patient-identity"
import { patientIdentifierCapabilityState } from "@/lib/hospital/patient-identifier-policy"
import { emitStatusEvent } from "@/lib/hospital/status-events"
import { logAuditInTransaction } from "@/lib/audit"

/**
 * Record the ЕГН of the patient a saved case is about.
 *
 * The record number (ИЗ №) identifies one admission and restarts every
 * January; the ЕГН identifies the person and is what joins the same patient's
 * admissions in every export. A case created before its ЕГН was known gets it
 * here, the same way the first save would have.
 *
 * It only fills a gap. An admission that already has a person is not
 * repointed by this route: changing who a patient is must stay a deliberate,
 * privileged correction, not a side effect of typing a number again.
 */

const schema = z.object({
  nationalId: z.string().trim().min(1).max(32),
})

const CORS = (req: NextRequest) => corsHeaders(req)

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: CORS(req) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // Patient identity exists only on an appliance; the public demo holds none.
  if (!isHospitalDeployment()) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "EGN_REQUIRED" }, { status: 400 })
  const nationalId = parsed.data.nationalId.replace(/\s+/g, "")
  if (!isValidEgn(nationalId)) return NextResponse.json({ error: "Invalid request", code: "INVALID_EGN" }, { status: 400 })
  if (!(await patientIdentifierCapabilityState()).egnPermitted) {
    return NextResponse.json({ error: "Forbidden", code: "EGN_DISABLED_BY_POLICY" }, { status: 403 })
  }

  try {
    const result = await withLockedCaseTransaction(id, async tx => {
      const caseRecord = await tx.case.findFirst({
        where: caseWriteWhereForUser(user, id),
        select: {
          id: true, institutionId: true, status: true,
          patientLink: { select: { id: true, institutionId: true, personLinkId: true } },
        },
      })
      if (!caseRecord) throw new CaseWriteError("CASE_NOT_FOUND", 404, "Not found")
      if (!caseRecord.institutionId || !caseRecord.patientLink) {
        return NextResponse.json({ error: "Invalid request", code: "NO_PATIENT_NUMBER" }, { status: 400 })
      }
      // A finalised case is an attested record, as for a correction.
      if (caseRecord.status === "COMPLETE") {
        return NextResponse.json({ error: "Case is finalised", code: "CASE_FINALIZED" }, { status: 409 })
      }
      if (caseRecord.patientLink.institutionId !== caseRecord.institutionId) {
        return NextResponse.json({ error: "conflict", code: "PATIENT_LINK_INSTITUTION_MISMATCH" }, { status: 409 })
      }

      const person = await resolvePatientLink(tx, caseRecord.institutionId, nationalId, user.id, "EGN")
      if (caseRecord.patientLink.personLinkId) {
        if (caseRecord.patientLink.personLinkId === person.id) return { personMaskedIdentifier: person.maskedIdentifier, changed: false }
        return NextResponse.json({
          error: "conflict",
          code: "PERSON_ALREADY_LINKED",
        }, { status: 409 })
      }
      const updated = await tx.patientLink.updateMany({
        where: { id: caseRecord.patientLink.id, personLinkId: null },
        data: { personLinkId: person.id },
      })
      if (updated.count === 0) {
        return NextResponse.json({ error: "conflict", code: "PERSON_ALREADY_LINKED" }, { status: 409 })
      }
      // Opaque link ids only: neither the number nor its masked form goes to the audit log.
      await logAuditInTransaction(tx, user.id, "CASE_PATIENT_PERSON_LINKED", id, {
        admissionLinkId: caseRecord.patientLink.id,
        personLinkId: person.id,
      })
      return { personMaskedIdentifier: person.maskedIdentifier, changed: true }
    })

    if (result instanceof Response) return result
    return NextResponse.json({ id, ...result }, { headers: CORS(req) })
  } catch (error: unknown) {
    if (error instanceof CaseWriteError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("[patient-link-person] CLINICAL_WRITE_FAILED")
    void emitStatusEvent("CLINICAL_WRITE_FAILED", { operation: "case-update" })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
