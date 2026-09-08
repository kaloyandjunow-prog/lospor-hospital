import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { corsHeaders } from "@/lib/cors"
import { getAuthUser } from "@/lib/mobile-auth"
import { caseWhereForUser, requireRole } from "@/lib/access-control"
import { CaseWriteError, withLockedCaseTransaction } from "@/lib/clinical-transaction"
import { isHospitalDeployment } from "@/lib/hospital/deployment"
import { resolvePatientLink } from "@/lib/hospital/patient-link"
import { emitStatusEvent } from "@/lib/hospital/status-events"
import { logAuditInTransaction, recordAdministrativeReason } from "@/lib/audit"

/**
 * Correct which patient a case belongs to.
 *
 * This used to be a field on the ordinary case save. Anyone who could edit the
 * case could repoint it at a different person, with no expected previous link,
 * no revision precondition, no stated reason, and an audit entry reading "case
 * updated" written after the transaction had committed. The previous link was
 * then deleted outright if no other case referenced it, so a mistyped number
 * did not merely misattribute the record -- it destroyed the evidence of the
 * correct linkage, and the mistake became unrecoverable and unauditable.
 *
 * Attaching an otherwise accurate anaesthetic record to the wrong person is one
 * of the more damaging things this system can do, so it is now a deliberate,
 * privileged, single-transaction act that says what it changed and why.
 *
 * The previous link is never deleted here. A correction is a claim about which
 * of two links is right, and destroying the other one removes the ability to
 * check. Orphaned links are cleaned up when a case is deleted, which is the
 * erasure path and a different question.
 */

const schema = z.object({
  // What the caller believes the case is linked to now. A correction made
  // against a stale view would otherwise silently overwrite whatever another
  // device did in between -- the exact failure this endpoint exists to prevent.
  expectedPatientLinkId: z.string().min(1),
  newPatientNumber: z.string().trim().min(1).max(128),
  correctionReason: z.string().trim().min(1).max(500),
})

const CORS = (req: NextRequest) => corsHeaders(req)

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: CORS(req) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isHospitalDeployment()) {
    // Patient linkage exists only on an appliance; the serverless deployment
    // holds no patient identifiers at all.
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (!requireRole(user, ["ADMIN", "HEAD_OF_DEPT"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({
      error: "expectedPatientLinkId, newPatientNumber and correctionReason are required",
    }, { status: 400 })
  }
  const { expectedPatientLinkId, newPatientNumber, correctionReason } = parsed.data

  try {
    const result = await withLockedCaseTransaction(id, async tx => {
      const caseRecord = await tx.case.findFirst({
        where: caseWhereForUser(user, id),
        select: { id: true, institutionId: true, patientLinkId: true, status: true },
      })
      if (!caseRecord) throw new CaseWriteError("CASE_NOT_FOUND", 404, "Not found")
      if (!caseRecord.institutionId) {
        return NextResponse.json({
          error: "An institution is required before a patient can be linked",
        }, { status: 400 })
      }
      // A finalised case is an attested record. Correcting who it is about
      // means unfinalising it first, so the correction is captured in a new
      // finalization rather than changed underneath the existing one.
      if (caseRecord.status === "COMPLETE") {
        return NextResponse.json({
          error: "Unfinalise the case before correcting the patient it belongs to",
        }, { status: 409 })
      }
      if (caseRecord.patientLinkId !== expectedPatientLinkId) {
        return NextResponse.json({
          error: "The case is no longer linked to the patient this correction expected",
          code: "PATIENT_LINK_CHANGED",
        }, { status: 409 })
      }

      const next = await resolvePatientLink(
        tx, caseRecord.institutionId, newPatientNumber, user.id,
      )
      if (next.id === caseRecord.patientLinkId) {
        return NextResponse.json({
          error: "That is the patient the case is already linked to",
        }, { status: 400 })
      }

      await tx.case.update({
        where: { id },
        data: { patientLinkId: next.id },
      })

      // Written inside the transaction, not after it. The audit entry and the
      // change it describes commit together or neither does; the previous
      // arrangement could commit the relink and lose the record of it.
      //
      // Opaque link IDs prove which relationship changed. Even a masked
      // patient number and the operator's free-text reason stay out of audit.
      // The route requires a 1-500 character explanation and used to keep only
      // the fact that one was given. Asking for it, validating it and then
      // discarding it left the operator believing they had recorded why they
      // relinked a patient when nothing had been kept.
      await recordAdministrativeReason(tx, {
        action: "CASE_PATIENT_LINK_CORRECTED",
        entityId: id,
        actorId: user.id,
        reason: correctionReason,
      })
      await logAuditInTransaction(tx, user.id, "CASE_PATIENT_LINK_CORRECTED", id, {
        fromPatientLinkId: expectedPatientLinkId,
        toPatientLinkId: next.id,
        correctionReasonRecorded: Boolean(correctionReason),
      })

      return { patientLinkId: next.id, maskedIdentifier: next.maskedIdentifier }
    })

    if (result instanceof Response) return result
    return NextResponse.json({ id, ...result }, { headers: CORS(req) })
  } catch (error: unknown) {
    if (error instanceof CaseWriteError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[patient-link-correct] CLINICAL_WRITE_FAILED")
    // "case-update" rather than a new operation value: the status event
    // vocabulary is a contract shared with the Status service, and this is a
    // case write. The audit log is where the specific act is recorded.
    void emitStatusEvent("CLINICAL_WRITE_FAILED", { operation: "case-update" })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
