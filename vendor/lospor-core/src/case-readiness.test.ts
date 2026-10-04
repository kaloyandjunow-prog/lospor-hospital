import { describe, expect, it } from "vitest"

import { caseReadiness, readinessFromRefusal, readinessItem, READINESS_KINDS } from "./case-readiness"
import { evaluateCaseFinalization } from "./clinical-validation"

const COMPLETE_PREOP = {
  ageYears: 40, sex: "MALE", heightCm: 180, weightKg: 80,
  diagnoses: [{ label: "Appendicitis" }], procedures: [{ label: "Appendicectomy" }],
  bpSystolic: 120, bpDiastolic: 80, heartRate: 70, respiratoryRate: 14,
  mallampati: "I", asaScore: "2",
}
const COMPLETE_INTRAOP = {
  startedAt: "2026-10-04T08:00:00Z", endedAt: "2026-10-04T09:00:00Z",
  techniques: ["GA"], airwayDevices: ["ETT"], positions: ["SUPINE"], ecg: true,
  vascularAccesses: ["PIV"], vitals: [{ hr: 70 }], drugs: [{ drugId: "propofol" }],
  fluids: [{ type: "RL" }], complications: "None",
}
const COMPLETE_POSTOP = {
  aldreteActivity: 2, aldreteRespiration: 2, aldreteCirculation: 2,
  aldreteConsciousness: 2, aldreteSpO2: 2, disposition: "WARD",
}

describe("everything at once, with somewhere to go", () => {
  it("lists every blocker in a case, not the first one", () => {
    const result = caseReadiness({
      clinicalMode: "ADULT",
      preop: { ...COMPLETE_PREOP, heightCm: null, mallampati: null },
      intraop: { ...COMPLETE_INTRAOP, endedAt: null },
      postop: { ...COMPLETE_POSTOP, disposition: null },
    })

    expect(result.ready).toBe(false)
    expect(result.blockers.map(item => item.kind)).toEqual([
      "incomplete_preop_demographics",
      "incomplete_preop_airway",
      "missing_end_time",
      "missing_disposition",
    ])
  })

  it("points each item at its stage and section", () => {
    const result = caseReadiness({
      clinicalMode: "ADULT",
      preop: { ...COMPLETE_PREOP, mallampati: null },
      intraop: { ...COMPLETE_INTRAOP, techniques: [] },
      postop: { ...COMPLETE_POSTOP, aldreteSpO2: null },
    })

    expect(result.blockers.map(item => item.target)).toEqual([
      { stage: "preop", section: "airway" },
      { stage: "intraop", area: "technique" },
      { stage: "postop", area: "recovery" },
    ])
  })

  it("is ready when nothing blocks, whatever the warnings", () => {
    const result = caseReadiness({
      clinicalMode: "ADULT",
      preop: COMPLETE_PREOP,
      intraop: { ...COMPLETE_INTRAOP, complications: "" },
      postop: COMPLETE_POSTOP,
    })

    expect(result.ready).toBe(true)
    expect(result.blockers).toEqual([])
    expect(result.warnings.map(item => item.kind)).toEqual(["missing_complication_documentation"])
  })

  it("agrees with the finalization rules on whether a case may close", () => {
    const cases = [
      { clinicalMode: "ADULT" as const, preop: COMPLETE_PREOP, intraop: COMPLETE_INTRAOP, postop: COMPLETE_POSTOP },
      { clinicalMode: "ADULT" as const, preop: COMPLETE_PREOP, intraop: COMPLETE_INTRAOP, postop: null },
      { clinicalMode: "ADULT" as const, preop: null, intraop: null, postop: null },
    ]
    for (const input of cases) {
      expect(caseReadiness(input).ready).toBe(evaluateCaseFinalization(input).valid)
    }
  })
})

describe("the check at End case", () => {
  it("leaves out recovery, which has not happened yet", () => {
    const result = caseReadiness(
      { clinicalMode: "ADULT", preop: COMPLETE_PREOP, intraop: COMPLETE_INTRAOP, postop: null },
      { omitPostop: true },
    )

    expect(result.ready).toBe(true)
    expect(result.blockers).toEqual([])
  })

  it("still lists what the team in theatre can fix", () => {
    const result = caseReadiness(
      { clinicalMode: "ADULT", preop: COMPLETE_PREOP, intraop: { ...COMPLETE_INTRAOP, techniques: [] }, postop: null },
      { omitPostop: true },
    )
    expect(result.blockers.map(item => item.kind)).toEqual(["missing_technique"])
  })
})

describe("the server's refusal becomes the same list", () => {
  it("reads every blocker the finalize route sends", () => {
    const result = readinessFromRefusal({
      error: "x",
      reason: "missing_end_time",
      blockers: [
        { code: "incomplete_preop", path: ["preop.physical_exam"] },
        { code: "missing_end_time", path: ["intraop.endedAt"] },
        { code: "missing_aldrete", path: ["postop.aldreteSpO2"] },
      ],
    })

    expect(result?.blockers.map(item => item.kind)).toEqual([
      "incomplete_preop_physical_exam",
      "missing_end_time",
      "missing_aldrete",
    ])
  })

  it("matches what the client would have shown for the same case", () => {
    const input = {
      clinicalMode: "ADULT" as const,
      preop: { ...COMPLETE_PREOP, weightKg: null },
      intraop: { ...COMPLETE_INTRAOP, endedAt: null },
      postop: null,
    }
    const server = evaluateCaseFinalization(input).issues
      .filter(issue => issue.severity === "error")
      .map(issue => ({ code: issue.code, path: issue.path }))

    expect(readinessFromRefusal({ blockers: server })?.blockers).toEqual(caseReadiness(input).blockers)
  })

  it("returns nothing for a body without a blocker list, so the caller falls back", () => {
    expect(readinessFromRefusal({ error: "x", reason: "missing_end_time" })).toBeNull()
    expect(readinessFromRefusal(null)).toBeNull()
    expect(readinessFromRefusal({ blockers: [] })).toBeNull()
  })
})

describe("a code this build does not know", () => {
  it("is still listed, under the stage its path names", () => {
    expect(readinessItem({ code: "missing_consent", path: ["intraop.consent"] })).toEqual({
      kind: "other", severity: "blocker", target: { stage: "intraop", area: "events" },
    })
  })

  it("keeps an unknown preop section rather than dropping it", () => {
    expect(readinessItem({ code: "incomplete_preop", path: ["preop.future_section"] }).kind).toBe("other")
  })

  it("lists every kind a client must label", () => {
    expect(READINESS_KINDS).toContain("incomplete_preop_demographics")
    expect(READINESS_KINDS).toContain("other")
    expect(new Set(READINESS_KINDS).size).toBe(READINESS_KINDS.length)
  })
})

describe("a drug that clashes with a recorded allergy", () => {
  const withDrug = (allergyAck?: { allergy: string; level: "same_class" }[]) => ({
    ...COMPLETE_INTRAOP,
    keyEvents: [{ id: "d", ts: "2026-10-04T08:10:00Z", type: "drug", name: "Ampicillin", atcCode: "J01CA01", ...(allergyAck ? { allergyAck } : {}) }],
  })
  const allergic = { ...COMPLETE_PREOP, allergies: true, allergyDetails: [{ label: "Penicillin" }] }

  it("is a warning when nobody acknowledged it, e.g. the allergy was recorded afterwards", () => {
    const result = caseReadiness({ clinicalMode: "ADULT", preop: allergic, intraop: withDrug(), postop: COMPLETE_POSTOP })
    expect(result.ready).toBe(true)
    expect(result.warnings.map(item => item.kind)).toContain("unacknowledged_allergy_conflict")
    expect(result.warnings.find(item => item.kind === "unacknowledged_allergy_conflict")?.target)
      .toEqual({ stage: "intraop", area: "medications" })
  })

  it("is nothing once the clinician acknowledged it when giving the dose", () => {
    const result = caseReadiness({
      clinicalMode: "ADULT", preop: allergic,
      intraop: withDrug([{ allergy: "Penicillin", level: "same_class" }]),
      postop: COMPLETE_POSTOP,
    })
    expect(result.warnings.map(item => item.kind)).not.toContain("unacknowledged_allergy_conflict")
  })

  it("is nothing for a case with no recorded allergies", () => {
    const result = caseReadiness({ clinicalMode: "ADULT", preop: { ...COMPLETE_PREOP, allergies: false }, intraop: withDrug(), postop: COMPLETE_POSTOP })
    expect(result.warnings.map(item => item.kind)).not.toContain("unacknowledged_allergy_conflict")
  })
})
