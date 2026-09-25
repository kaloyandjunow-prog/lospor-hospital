import { describe, expect, it } from "vitest"
import {
  hasDedicatedPreopControl,
  isPreopQuestionRequired,
  isPreopQuestionShown,
  isPreopScoreAvailable,
  preopAnswerStates,
  preopQuestionProgress,
  preopQuestionRows,
  type PreopAnswerState,
  type PreopFormSection,
  type PreopProfileQuestion,
} from "./preop-assessment"

function question(stableKey: string, over: Partial<PreopProfileQuestion> = {}): PreopProfileQuestion {
  return {
    stableKey,
    enabled: true,
    required: false,
    sortOrder: -1, // unset: the fixture profile uses list position
    section: "ADULT_ADDITIONS",
    formSection: "anamnesis",
    parentKey: null,
    labelEn: stableKey,
    labelBg: stableKey,
    answerType: "CHOICE",
    applicability: [],
    allowUnknown: false,
    allowNotApplicable: false,
    conditionalRuleKey: null,
    omopDomain: "observation",
    omopConceptId: 0,
    omopSourceCode: `LOSPOR:PREOP_${stableKey}`,
    options: [],
    ...over,
  }
}

const profile = (questions: PreopProfileQuestion[]) => ({
  questions: questions.map((item, index) => ({ ...item, sortOrder: item.sortOrder >= 0 ? item.sortOrder : index })),
})
const keys = (section: PreopFormSection, questions: PreopProfileQuestion[], states: Record<string, PreopAnswerState> = {}, mode = "ADULT") =>
  preopQuestionRows(profile(questions), section, mode, new Map(Object.entries(states))).map(row => `${row.depth}:${row.question.stableKey}`)

describe("the generic question rows of a section", () => {
  it("lists enabled questions of the section in the operator's order", () => {
    expect(keys("anamnesis", [
      question("A5", { sortOrder: 2 }),
      question("A1", { sortOrder: 1 }),
      question("A12", { formSection: "physical_exam" }),
      question("A7", { enabled: false }),
    ])).toEqual(["0:A1", "0:A5"])
  })

  it("shows a follow-up straight after its parent, and only while the parent is YES", () => {
    const questions = [
      question("A1", { sortOrder: 0 }),
      question("A5", { sortOrder: 1 }),
      question("A1_TWO_WEEKS", { parentKey: "A1", sortOrder: 9 }),
    ]
    expect(keys("anamnesis", questions)).toEqual(["0:A1", "0:A5"])
    expect(keys("anamnesis", questions, { A1: "NO" })).toEqual(["0:A1", "0:A5"])
    expect(keys("anamnesis", questions, { A1: "YES" })).toEqual(["0:A1", "1:A1_TWO_WEEKS", "0:A5"])
  })

  it("asks a case only the questions of its population", () => {
    const questions = [question("A1", { applicability: ["ADULT"] }), question("P8", { applicability: ["PEDIATRIC"] })]
    expect(keys("anamnesis", questions, {}, "ADULT")).toEqual(["0:A1"])
    expect(keys("anamnesis", questions, {}, "PEDIATRIC")).toEqual(["0:P8"])
  })

  it("leaves baseline questions to their own controls but shows their follow-ups", () => {
    const questions = [
      question("BASE_UNEXPLAINED_ANAESTHESIA_COMPLICATIONS"),
      question("A6", { parentKey: "BASE_UNEXPLAINED_ANAESTHESIA_COMPLICATIONS" }),
    ]
    expect(keys("anamnesis", questions)).toEqual([])
    expect(keys("anamnesis", questions, { BASE_UNEXPLAINED_ANAESTHESIA_COMPLICATIONS: "YES" })).toEqual(["1:A6"])
  })

  it("draws nothing for a section with no enabled questions, and nothing without a profile", () => {
    expect(keys("airway", [question("A1")])).toEqual([])
    expect(preopQuestionRows(null, "anamnesis", "ADULT", new Map())).toEqual([])
  })

  it("keeps a long section complete and ordered when every question is on", () => {
    const many = Array.from({ length: 45 }, (_, index) => question(`Q${index}`, { sortOrder: 44 - index }))
    const rows = keys("anamnesis", many)
    expect(rows).toHaveLength(45)
    expect(rows[0]).toBe("0:Q44")
    expect(rows[44]).toBe("0:Q0")
  })

  it("counts answered rows for the section label", () => {
    const rows = preopQuestionRows(profile([question("A1"), question("A5")]), "anamnesis", "ADULT", new Map())
    expect(preopQuestionProgress(rows, new Map([["A1", "NO"], ["A5", "NOT_ASKED"]]))).toEqual({ answered: 1, total: 2 })
  })
})

describe("baseline controls and scores follow the profile", () => {
  it("hides a switched-off baseline control and keeps everything visible without a profile", () => {
    const current = profile([question("BASE_SMOKING", { enabled: false }), question("BASE_LATEX_ALLERGY")])
    expect(isPreopQuestionShown(current, "BASE_SMOKING", "ADULT")).toBe(false)
    expect(isPreopQuestionShown(current, "BASE_LATEX_ALLERGY", "ADULT")).toBe(true)
    expect(isPreopQuestionShown(null, "BASE_SMOKING", "ADULT")).toBe(true)
  })

  it("marks a question required only while it is shown", () => {
    const current = profile([question("BASE_SMOKING", { required: true }), question("P8", { required: true, applicability: ["PEDIATRIC"] })])
    expect(isPreopQuestionRequired(current, "BASE_SMOKING", "ADULT")).toBe(true)
    expect(isPreopQuestionRequired(current, "P8", "ADULT")).toBe(false)
  })

  it("makes a score unavailable when one of its inputs is switched off", () => {
    expect(isPreopScoreAvailable(profile([question("BASE_RCRI_CHF", { enabled: false })]), "RCRI")).toBe(false)
    expect(isPreopScoreAvailable(profile([question("BASE_RCRI_CHF")]), "RCRI")).toBe(true)
    expect(isPreopScoreAvailable(null, "APFEL")).toBe(true)
  })

  it("reads answer states from both the legacy fields and preopAnswers", () => {
    const states = preopAnswerStates({
      smoking: false,
      unexplainedAnaesthesiaComplications: true,
      coldsApplicable: false,
      preopAnswers: [{ stableKey: "A1", state: "YES" }],
    })
    expect(states.get("BASE_SMOKING")).toBe("NO")
    expect(states.get("BASE_UNEXPLAINED_ANAESTHESIA_COMPLICATIONS")).toBe("YES")
    expect(states.has("BASE_COLDS_APPLICABLE")).toBe(false)
    expect(states.get("A1")).toBe("YES")
  })

  it("knows which questions have their own control", () => {
    expect(hasDedicatedPreopControl("BASE_SMOKING")).toBe(true)
    expect(hasDedicatedPreopControl("BASE_SURGERY_URGENCY")).toBe(true)
    expect(hasDedicatedPreopControl("A1_RECENT_INFECTION")).toBe(false)
  })
})
