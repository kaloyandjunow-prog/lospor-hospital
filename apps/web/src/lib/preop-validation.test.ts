import { describe, expect, it } from "vitest"
import { missingPreopFields } from "./preop-validation"
import type { PreopData } from "@/components/forms/preopSchema"

/**
 * What a preoperative assessment must contain is core's, and tested there.
 * This app's part is the two things core cannot see: the unobtainable markers,
 * which are live form state and not saved record fields, and the names this
 * form's own error display uses for the fields.
 */

function complete(over: Partial<PreopData> = {}): PreopData {
  return {
    ageYears: 55,
    sex: "MALE",
    heightCm: 171,
    weightKg: 82,
    diagnoses: [{ label: "Cholelithiasis" }],
    procedures: [{ label: "Cholecystectomy" }],
    bpSystolic: 130,
    bpDiastolic: 80,
    heartRate: 72,
    respiratoryRate: 14,
    mallampati: "II",
    asaScore: "II",
    ...over,
  } as PreopData
}

const NOTHING_UNOBTAINABLE = new Set<string>()

describe("which preoperative fields this form still wants", () => {
  it("asks for nothing when the assessment is complete", () => {
    expect(missingPreopFields(complete(), NOTHING_UNOBTAINABLE, false)).toEqual([])
  })

  /**
   * Core names the field it is unhappy about; this form displays its errors
   * under different names. A mapping that drifted would leave an error with
   * nowhere on the page to appear.
   */
  it("names the fields the way this form's error display does", () => {
    expect(missingPreopFields(
      complete({ bpSystolic: null, mallampati: undefined }),
      NOTHING_UNOBTAINABLE,
      false,
    )).toEqual(["bp", "airway"])
  })

  /**
   * The markers live in form state, not in the record, so the only way core
   * hears about them is through this call. If it stopped, the form would demand
   * a blood pressure the clinician has already documented as untakeable.
   */
  it("carries the unobtainable markers through to the shared rule", () => {
    const stripped = complete({
      bpSystolic: null,
      bpDiastolic: null,
      heartRate: null,
      respiratoryRate: null,
      mallampati: undefined,
    })
    expect(missingPreopFields(
      stripped,
      new Set(["bp", "heartRate", "respiratoryRate"]),
      true,
    )).toEqual([])
    expect(missingPreopFields(stripped, new Set(["bp"]), false))
      .toEqual(["heartRate", "respiratoryRate", "airway"])
  })

  it("refuses a paediatric age left in an adult-mode record", () => {
    expect(missingPreopFields(complete({ ageYears: 12 }), NOTHING_UNOBTAINABLE, false))
      .toEqual(["ageYears"])
  })

  it("reports a paediatric record's age against its own field", () => {
    expect(missingPreopFields(
      complete({ clinicalMode: "PEDIATRIC", ageYears: null, ageValue: null } as Partial<PreopData>),
      NOTHING_UNOBTAINABLE,
      false,
    )).toEqual(["ageValue"])
  })
})
