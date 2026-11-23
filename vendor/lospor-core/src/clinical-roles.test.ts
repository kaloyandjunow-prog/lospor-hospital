import { describe, expect, it } from "vitest"
import { clinicalRoleOf, nurseSeesTheatreCase, roleMay, isNurseAccountRole, mayAssignNurses, mayTakeCase } from "./clinical-roles"
import { ISO_26825_GROUP_COLORS, isoDrugGroupColor, shadeForSameGroup } from "./drug-colors-iso"
import { resolveDrugColor } from "./drug-colors"

describe("what an anaesthesia nurse may do", () => {
  it("charts intraop and postop and hands over to a nurse, nothing more", () => {
    for (const action of ["EDIT_INTRAOP", "EDIT_POSTOP", "HAND_OVER_TO_NURSE"] as const) expect(roleMay("ANAESTHESIA_NURSE", action)).toBe(true)
    for (const action of ["EDIT_PREOP", "CREATE_CASE", "FINALISE", "UNFINALISE", "DELETE_CASE", "CANCEL_PROCEDURE", "CHANGE_RESPONSIBLE_DOCTOR", "HAND_OVER_TO_DOCTOR", "ASSIGN_NURSES", "GIVE_DESPITE_ALLERGY", "SET_PLANNED_SURGERY_DATE", "INSTITUTION_SETTINGS", "CLINICAL_RULES", "AUDIT_LOG", "STATUS", "RESEARCH_EXPORT"] as const) {
      expect(roleMay("ANAESTHESIA_NURSE", action), action).toBe(false)
    }
    expect(roleMay("ANAESTHETIST", "FINALISE")).toBe(true)
    expect(clinicalRoleOf("ANAESTHESIA_NURSE")).toBe("ANAESTHESIA_NURSE")
    expect(clinicalRoleOf("MEMBER")).toBe("ANAESTHETIST")
  })

  it("sees a theatre's cases for its day, and keeps a case she worked on until it is finalised", () => {
    const base = { caseTheatreId: "t3", nurseTheatreId: "t3", caseFinalised: false, plannedSurgeryDate: "2026-11-22", shiftDate: "2026-11-22", nurseWorkedOnCase: false }
    expect(nurseSeesTheatreCase(base)).toBe(true)
    expect(nurseSeesTheatreCase({ ...base, plannedSurgeryDate: "2026-11-29" })).toBe(false)
    expect(nurseSeesTheatreCase({ ...base, plannedSurgeryDate: null })).toBe(true)
    expect(nurseSeesTheatreCase({ ...base, caseTheatreId: "t1" })).toBe(false)
    expect(nurseSeesTheatreCase({ ...base, caseTheatreId: "t1", nurseWorkedOnCase: true })).toBe(true)
    expect(nurseSeesTheatreCase({ ...base, nurseWorkedOnCase: true, caseFinalised: true })).toBe(false)
  })
})

describe("ISO 26825 colours", () => {
  it("colours the standard's groups and leaves the rest to the bundled colours", () => {
    expect(isoDrugGroupColor("Opioid analgesics")).toBe("#38bdf8")
    expect(isoDrugGroupColor("Antimicrobials often given intraoperatively")).toBeNull()
    expect(Object.keys(ISO_26825_GROUP_COLORS)).toHaveLength(10)
  })

  it("lets the hospital's colours win", () => {
    expect(resolveDrugColor(null, "Opioid analgesics", "Fentanyl")).toBe("#38bdf8")
    expect(resolveDrugColor({ groups: { "Opioid analgesics": "#111111" }, drugs: {} }, "Opioid analgesics", "Fentanyl")).toBe("#111111")
    expect(resolveDrugColor({ groups: {}, drugs: { Fentanyl: "#222222" } }, "Opioid analgesics", "Fentanyl")).toBe("#222222")
  })

  it("shades a second item of the same group", () => {
    expect(shadeForSameGroup("#38bdf8", 0)).toBe("#38bdf8")
    expect(shadeForSameGroup("#38bdf8", 1)).not.toBe("#38bdf8")
    expect(shadeForSameGroup("#38bdf8", 2)).not.toBe(shadeForSameGroup("#38bdf8", 1))
  })
})

describe("the senior nurse and who puts nurses on a case (2026-11-23)", () => {
  it("is a nurse who also assigns nurses, and a nurse does not", () => {
    expect(clinicalRoleOf("ANAESTHESIA_SENIOR_NURSE")).toBe("ANAESTHESIA_SENIOR_NURSE")
    expect(roleMay("ANAESTHESIA_SENIOR_NURSE", "ASSIGN_NURSES")).toBe(true)
    expect(roleMay("ANAESTHESIA_SENIOR_NURSE", "EDIT_INTRAOP")).toBe(true)
    expect(roleMay("ANAESTHESIA_SENIOR_NURSE", "EDIT_PREOP")).toBe(false)
    expect(roleMay("ANAESTHESIA_SENIOR_NURSE", "FINALISE")).toBe(false)
    expect(roleMay("ANAESTHESIA_NURSE", "ASSIGN_NURSES")).toBe(false)
    expect(isNurseAccountRole("ANAESTHESIA_NURSE") && isNurseAccountRole("ANAESTHESIA_SENIOR_NURSE") && !isNurseAccountRole("MEMBER")).toBe(true)
  })
  it("lets the head and the administrator assign on every case, a doctor on her own, a senior nurse in her hospital", () => {
    const own = { ownsCase: true, sameInstitution: true }
    const other = { ownsCase: false, sameInstitution: true }
    expect(mayAssignNurses({ accountRole: "ADMIN", ownsCase: false, sameInstitution: false })).toBe(true)
    expect(mayAssignNurses({ accountRole: "HEAD_OF_DEPT", ...other })).toBe(true)
    expect(mayAssignNurses({ accountRole: "HEAD_OF_DEPT", ownsCase: false, sameInstitution: false })).toBe(false)
    expect(mayAssignNurses({ accountRole: "MEMBER", ...own })).toBe(true)
    expect(mayAssignNurses({ accountRole: "MEMBER", ...other })).toBe(false)
    expect(mayAssignNurses({ accountRole: "ANAESTHESIA_SENIOR_NURSE", ...other })).toBe(true)
    expect(mayAssignNurses({ accountRole: "ANAESTHESIA_NURSE", ...own })).toBe(false)
  })
  it("lets a nurse put herself on a case that has no nurse", () => {
    expect(mayTakeCase({ accountRole: "ANAESTHESIA_NURSE", nursesOnCase: 0, sameInstitution: true })).toBe(true)
    expect(mayTakeCase({ accountRole: "ANAESTHESIA_NURSE", nursesOnCase: 1, sameInstitution: true })).toBe(false)
    expect(mayTakeCase({ accountRole: "ANAESTHESIA_NURSE", nursesOnCase: 0, sameInstitution: false })).toBe(false)
    expect(mayTakeCase({ accountRole: "MEMBER", nursesOnCase: 0, sameInstitution: true })).toBe(false)
  })
})
