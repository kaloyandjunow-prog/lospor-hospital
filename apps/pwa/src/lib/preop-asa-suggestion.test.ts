import { describe, expect, it } from "vitest"
import { suggestASAFromTags } from "./preop-asa-suggestion"

describe("preop ASA suggestion", () => {
  it("suggests ASA IV for severe coded disease", () => {
    expect(suggestASAFromTags([{ label: "CKD stage 5", code: "N18.5" }], null)).toEqual({
      cls: "IV",
      reasonCodes: ["ckd_stage_5"],
      reasons: ["Chronic kidney disease stage 5"],
    })
  })

  it("suggests ASA III for morbid obesity from BMI alone", () => {
    expect(suggestASAFromTags([], 42.1)).toEqual({
      cls: "III",
      reasonCodes: ["morbid_obesity_bmi"],
      reasons: ["Morbid obesity (BMI 42.1)"],
    })
  })

  it("falls back to ASA II when comorbidities have no mapped code", () => {
    expect(suggestASAFromTags([{ label: "Rare condition", code: "X99" }], null)).toEqual({
      cls: "II",
      reasonCodes: ["comorbidities_present"],
      reasons: ["Comorbidities present"],
    })
  })
})
