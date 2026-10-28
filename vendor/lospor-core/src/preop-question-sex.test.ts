import { describe, expect, it } from "vitest"
import { isPreopQuestionShown, preopQuestionAppliesToSex, preopQuestionRows, type PreopProfileQuestion } from "./preop-assessment"

// Pregnancy and breastfeeding are not asked of a man (10.0.0); a woman, "other"
// or a sex not yet recorded is asked, so nothing hides behind a missing field.

const question = (stableKey: string, extra: Partial<PreopProfileQuestion> = {}): PreopProfileQuestion => ({
  stableKey, enabled: true, required: false, sortOrder: 0, section: "ADULT_ADDITIONS", formSection: "demographics",
  parentKey: null, labelEn: stableKey, labelBg: stableKey, answerType: "BOOLEAN", applicability: [],
  allowUnknown: false, allowNotApplicable: true, conditionalRuleKey: null, omopDomain: "observation",
  omopConceptId: 0, omopSourceCode: null, options: [], ...extra,
})

describe("questions asked by sex", () => {
  it("leaves pregnancy and breastfeeding, and their follow-ups, off for a man only", () => {
    for (const key of ["A13_PREGNANCY", "A13_GESTATIONAL_AGE_KNOWN", "A14_BREASTFEEDING", "A14_CONTINUE_BREASTFEEDING"]) {
      expect(preopQuestionAppliesToSex(key, "MALE"), key).toBe(false)
      for (const sex of ["FEMALE", "OTHER", "UNKNOWN", null, undefined]) expect(preopQuestionAppliesToSex(key, sex), `${key} ${sex}`).toBe(true)
    }
    expect(preopQuestionAppliesToSex("A12_PACEMAKER_ICD", "MALE")).toBe(true)
  })

  it("draws the rows and answers the visibility check the same way", () => {
    const profile = { questions: [question("A13_PREGNANCY"), question("A12_PACEMAKER_ICD", { sortOrder: 1 })] }
    const keys = (sex: string | null) => preopQuestionRows(profile, "demographics", "ADULT", new Map(), 40, sex).map(row => row.question.stableKey)
    expect(keys("MALE")).toEqual(["A12_PACEMAKER_ICD"])
    expect(keys("FEMALE")).toEqual(["A13_PREGNANCY", "A12_PACEMAKER_ICD"])
    expect(isPreopQuestionShown(profile, "A13_PREGNANCY", "ADULT", 40, "MALE")).toBe(false)
    expect(isPreopQuestionShown(profile, "A13_PREGNANCY", "ADULT", 40, "FEMALE")).toBe(true)
  })
})
