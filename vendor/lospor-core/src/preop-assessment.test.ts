import { describe, expect, it } from "vitest"
import {
  hasDedicatedPreopControl,
  isPreopQuestionRequired,
  isPreopQuestionShown,
  isPreopScoreAvailable,
  preopAnswerStates,
  preopPopulationForMode,
  preopProfileForMode,
  preopQuestionAppliesToAge,
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

describe("one profile for adults and one for children (9.14.5)", () => {
  const shared = question("A1_RECENT_INFECTION", {
    byMode: { ADULT: { enabled: true, required: false, sortOrder: 0 }, PEDIATRIC: { enabled: true, required: true, sortOrder: 2 } },
  })
  const adultOnly = question("A2_EXERCISE_TOLERANCE", {
    applicability: ["ADULT"],
    byMode: { ADULT: { enabled: false, required: false, sortOrder: 1 } },
  })
  const childOnly = question("P2_HOME_OXYGEN_NIV", {
    applicability: ["PEDIATRIC"],
    byMode: { PEDIATRIC: { enabled: true, required: false, sortOrder: 0 } },
  })
  const both = profile([shared, adultOnly, childOnly])

  it("gives each population its own on, required and order for a shared question", () => {
    const adult = preopProfileForMode(both, "ADULT")!
    const child = preopProfileForMode(both, "PEDIATRIC")!
    expect(isPreopQuestionRequired(adult, "A1_RECENT_INFECTION", "ADULT")).toBe(false)
    expect(isPreopQuestionRequired(child, "A1_RECENT_INFECTION", "PEDIATRIC")).toBe(true)
    const keys = (p: typeof both, mode: string) => preopQuestionRows(p, "anamnesis", mode, new Map()).map(row => row.question.stableKey)
    expect(keys(child, "PEDIATRIC")).toEqual(["P2_HOME_OXYGEN_NIV", "A1_RECENT_INFECTION"])
    expect(keys(adult, "ADULT")).toEqual(["A1_RECENT_INFECTION"])
  })

  it("switches off a question the population is never asked", () => {
    const adult = preopProfileForMode(both, "ADULT")!
    expect(adult.questions.find(item => item.stableKey === "P2_HOME_OXYGEN_NIV")).toMatchObject({ enabled: false, required: false })
  })

  it("leaves a single profile from an older server, and an unknown mode, as they are", () => {
    const legacy = profile([question("A1_RECENT_INFECTION", { required: true })])
    expect(preopProfileForMode(legacy, "PEDIATRIC")).toBe(legacy)
    expect(preopProfileForMode(both, null)).toBe(both)
    expect(preopProfileForMode(null, "ADULT")).toBeNull()
  })

  it("treats anything but PEDIATRIC as the adult profile", () => {
    expect(preopPopulationForMode("PEDIATRIC")).toBe("PEDIATRIC")
    expect(preopPopulationForMode("ADULT")).toBe("ADULT")
    expect(preopPopulationForMode(null)).toBe("ADULT")
  })
})

describe("questions asked from an age", () => {
  const alcohol = question("S2_ALCOHOL_USE", { minAgeYears: 14 })
  const child = { questions: [alcohol, question("S2_ALCOHOL_HEAVY", { minAgeYears: 14, parentKey: "S2_ALCOHOL_USE" })] }
  const keys = (ageYears: number | null | undefined) => preopQuestionRows(child, "anamnesis", "PEDIATRIC", new Map([["S2_ALCOHOL_USE", "YES"]]), ageYears).map(row => row.question.stableKey)

  it("leaves the question and its follow-ups off a younger patient", () => {
    expect(keys(9)).toEqual([])
    expect(keys(14)).toEqual(["S2_ALCOHOL_USE", "S2_ALCOHOL_HEAVY"])
    expect(keys(15.5)).toEqual(["S2_ALCOHOL_USE", "S2_ALCOHOL_HEAVY"])
  })

  it("asks it while the age is not yet known", () => {
    expect(keys(null)).toEqual(["S2_ALCOHOL_USE", "S2_ALCOHOL_HEAVY"])
    expect(keys(undefined)).toEqual(["S2_ALCOHOL_USE", "S2_ALCOHOL_HEAVY"])
    expect(preopQuestionAppliesToAge(undefined, 3)).toBe(true)
  })

  it("is not required below the age", () => {
    const required = { questions: [{ ...alcohol, required: true }] }
    expect(isPreopQuestionRequired(required, "S2_ALCOHOL_USE", "PEDIATRIC", 10)).toBe(false)
    expect(isPreopQuestionRequired(required, "S2_ALCOHOL_USE", "PEDIATRIC", 16)).toBe(true)
    expect(isPreopQuestionShown(required, "S2_ALCOHOL_USE", "ADULT", 40)).toBe(true)
  })
})
