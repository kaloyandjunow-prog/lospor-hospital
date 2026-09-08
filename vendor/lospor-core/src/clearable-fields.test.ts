import { describe, expect, it } from "vitest"
import {
  CLINICAL_CLEARABLE_FIELDS,
  CLINICAL_NUMBER_RULES,
} from "./clinical-validation"

/**
 * The list both clients build their form schemas from. Its job is to stop the
 * two apps answering "nobody has said" differently, which is what they did:
 * one spelled it `undefined` and could therefore record an answer but never
 * take one back, and the other coerced it into a number.
 */
describe("which clinical fields can be cleared", () => {
  it("names a real field in every case", () => {
    for (const section of ["preop", "intraop", "postop"] as const) {
      for (const field of CLINICAL_CLEARABLE_FIELDS[section]) {
        // ageUnit and ponv are not numbers; everything else must have bounds.
        if (field === "ageUnit" || field === "ponv") continue
        expect(
          CLINICAL_NUMBER_RULES[section][field],
          `${section}.${field} is listed as clearable but has no rule`,
        ).toBeDefined()
      }
    }
  })

  /**
   * The Aldrete components are the reason this list exists. Zero on all five
   * describes an unresponsive, apnoeic patient, so a cleared component that
   * became 0 would document that assessment on someone nobody had looked at.
   */
  it("covers every Aldrete component", () => {
    for (const component of [
      "aldreteActivity", "aldreteRespiration", "aldreteCirculation",
      "aldreteConsciousness", "aldreteSpO2",
    ]) {
      expect(CLINICAL_CLEARABLE_FIELDS.postop).toContain(component)
    }
  })

  // A recorded zero and an unrecorded field are different statements about the
  // patient, and both of these can legitimately be zero.
  it("covers the measurements where zero is itself a finding", () => {
    expect(CLINICAL_CLEARABLE_FIELDS.intraop).toContain("bloodLossMl")
    expect(CLINICAL_CLEARABLE_FIELDS.postop).toContain("painScoreNRS")
    expect(CLINICAL_CLEARABLE_FIELDS.postop).toContain("paedScore")
  })

  it("covers the preoperative vitals a clinician can take back", () => {
    for (const vital of [
      "bpSystolic", "bpDiastolic", "heartRate", "spO2", "temperature", "respiratoryRate",
    ]) {
      expect(CLINICAL_CLEARABLE_FIELDS.preop).toContain(vital)
    }
  })

  it("lists nothing twice", () => {
    for (const section of ["preop", "intraop", "postop"] as const) {
      const fields = CLINICAL_CLEARABLE_FIELDS[section]
      expect(new Set(fields).size).toBe(fields.length)
    }
  })
})
