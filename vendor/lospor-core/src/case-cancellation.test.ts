import { describe, expect, it } from "vitest"
import { cancellationAllowed, cancellationReasonLabel, isCancellationReason, isCaseClosed } from "./case-cancellation"
import { deriveCaseStage } from "./case-status"
import { evaluateCaseFinalization, preopReadyForAllocation } from "./clinical-validation"
import { blockerKinds } from "./case-readiness"
import { hasPlannedProcedure, plannedProcedureLabel, UNDETERMINED_PROCEDURE } from "./procedure-codes"

describe("a cancelled procedure (10.0.0)", () => {
  it("can be cancelled until the anaesthesia start is set", () => {
    expect(cancellationAllowed({ status: "DRAFT", intraop: null })).toBe(true)
    expect(cancellationAllowed({ status: "IN_PROGRESS", intraop: { startedAt: null } })).toBe(true)
    expect(cancellationAllowed({ status: "IN_PROGRESS", intraop: { startedAt: "2026-10-28T08:00:00Z" } })).toBe(false)
    expect(cancellationAllowed({ status: "CANCELLED" })).toBe(false)
    expect(cancellationAllowed({ status: "COMPLETE" })).toBe(false)
    expect(isCaseClosed("CANCELLED")).toBe(true)
  })

  it("names its reasons in both languages", () => {
    expect(isCancellationReason("PATIENT_CONDITION")).toBe(true)
    expect(isCancellationReason("BORED")).toBe(false)
    expect(cancellationReasonLabel("SURGICAL_DECISION", "bg")).toBe("Решение на хирурга")
  })

  it("shows as cancelled whatever else the case holds", () => {
    expect(deriveCaseStage({ status: "CANCELLED", preop: { diagnosis: "x", plannedProcedure: "y", asaScore: "II" } })).toBe("CANCELLED")
  })
})

describe("a planned procedure not yet known (10.0.0)", () => {
  const preop = {
    ageYears: 50, sex: "MALE", heightCm: 175, weightKg: 80, diagnoses: [{ label: "Acute abdomen" }],
    procedureUndetermined: true, asaScore: "II", bpUnobtainable: true, heartRateUnobtainable: true, respiratoryRateUnobtainable: true, airwayUnobtainable: true,
  }

  it("stands for the planned procedure", () => {
    expect(hasPlannedProcedure(preop)).toBe(true)
    expect(hasPlannedProcedure({ procedureUndetermined: false })).toBe(false)
    expect(preopReadyForAllocation(preop)).toBe(true)
    expect(plannedProcedureLabel(preop, "bg")).toBe(UNDETERMINED_PROCEDURE.labelBg)
    expect(UNDETERMINED_PROCEDURE.conceptId).toBe(4301351)
  })

  it("needs the procedure done before the case is finalised", () => {
    const postop = { aldreteActivity: 2, aldreteRespiration: 2, aldreteCirculation: 2, aldreteConsciousness: 2, aldreteSpO2: 2, disposition: "WARD" }
    const without = evaluateCaseFinalization({ clinicalMode: "ADULT", preop, intraop: null, postop })
    expect(blockerKinds(without.issues)).toContain("missing_performed_procedure")
    const withDone = evaluateCaseFinalization({ clinicalMode: "ADULT", preop, intraop: null, postop: { ...postop, performedProcedures: [{ label: "Exploratory laparotomy" }] } })
    expect(blockerKinds(withDone.issues)).not.toContain("missing_performed_procedure")
    // A known planned procedure needs nothing more.
    const known = evaluateCaseFinalization({ clinicalMode: "ADULT", preop: { ...preop, procedureUndetermined: false, procedures: [{ label: "Appendectomy" }] }, intraop: null, postop })
    expect(blockerKinds(known.issues)).not.toContain("missing_performed_procedure")
  })
})
