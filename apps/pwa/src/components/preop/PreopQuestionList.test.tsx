import React from "react"
import { describe, expect, it, vi } from "vitest"
import { useForm } from "react-hook-form"
import type { PreopAnswerState, PreopProfileQuestion } from "@lospor/core/preop-assessment"
import { act } from "react-test-renderer"
import { render } from "@/test/render"
import type { PreopFormInput } from "@/lib/preop-form-schema"
import { PreopQuestionList } from "./PreopQuestionList"
import { PreopAnamnesisFields } from "./PreopAnamnesisFields"

const TEXT: Record<string, string> = {
  preopQuestionsAnswered: "{answered} of {total} answered",
  answerYes: "Yes",
  answerNo: "No",
}
const tc = (key: string) => TEXT[key] ?? key
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => TEXT[key] ?? key }) }))

let order = 0
function question(stableKey: string, over: Partial<PreopProfileQuestion> = {}): PreopProfileQuestion {
  return {
    stableKey, enabled: true, required: false, sortOrder: order++, section: "ADULT_ADDITIONS",
    formSection: "anamnesis", parentKey: null, labelEn: `Label ${stableKey}`, labelBg: `Етикет ${stableKey}`,
    answerType: "CHOICE", applicability: [], allowUnknown: false, allowNotApplicable: false,
    conditionalRuleKey: null, omopDomain: "observation", omopConceptId: 0, omopSourceCode: null,
    options: [], ...over,
  }
}

function list(questions: PreopProfileQuestion[], states: Record<string, PreopAnswerState> = {}, onAnswer = vi.fn(), mode: "ADULT" | "PEDIATRIC" = "ADULT") {
  return render(
    <PreopQuestionList profile={{ questions }} formSection="anamnesis" mode={mode} states={new Map(Object.entries(states))}
      onAnswer={onAnswer} tc={tc as never} language="en" />,
  )
}

const rowIds = (tree: ReturnType<typeof render>) =>
  tree.root.findAll(node => typeof node.props.testID === "string" && node.props.testID.startsWith("preop-question-") && typeof node.type === "string")
    .map(node => node.props.testID as string)

describe("the preop questions of a section", () => {
  it("draws nothing when nothing in the section is switched on", () => {
    expect(list([question("A1", { enabled: false })]).toJSON()).toBeNull()
  })

  it("draws every question when all forty are on, in order, with the progress count", () => {
    const tree = list(Array.from({ length: 40 }, (_, index) => question(`Q${index}`)))
    expect(rowIds(tree)).toHaveLength(40)
    expect(rowIds(tree)[0]).toBe("preop-question-Q0")
    expect(JSON.stringify(tree.toJSON())).toContain("0 of 40 answered")
  })

  it("shows a follow-up only while its parent is YES", () => {
    const questions = [question("A1"), question("A1_TWO_WEEKS", { parentKey: "A1" })]
    expect(rowIds(list(questions))).toEqual(["preop-question-A1"])
    expect(rowIds(list(questions, { A1: "YES" }))).toEqual(["preop-question-A1", "preop-question-A1_TWO_WEEKS"])
  })

  it("asks a pediatric case only pediatric and shared questions", () => {
    const questions = [question("A1", { applicability: ["ADULT"] }), question("P8", { applicability: ["PEDIATRIC"] })]
    expect(rowIds(list(questions, {}, vi.fn(), "PEDIATRIC"))).toEqual(["preop-question-P8"])
  })

  it("records a YES through onAnswer, and marks a required question", () => {
    const onAnswer = vi.fn()
    const tree = list([question("A12", { required: true })], {}, onAnswer)
    const yes = tree.root.find(node => node.props.accessibilityLabel === "Label A12 *: Yes" && typeof node.props.onPress === "function")
    act(() => { yes.props.onPress() })
    expect(onAnswer).toHaveBeenCalledWith("A12", { stableKey: "A12", state: "YES", optionKey: "YES" })
  })
})

describe("the anamnesis toggles follow the profile", () => {
  function Harness({ shownField }: { shownField: (field: string) => boolean }) {
    const { control, setValue } = useForm<PreopFormInput>()
    return (
      <PreopAnamnesisFields control={control} setValue={setValue} tc={tc as never} allergies={null} familyAnesthesiaProblems={null}
        pediatricMode={false} rcriSuggested={{}} stopBangBPSuggested={false} RCRI_HINT="" sex={null} smoking={null} bmi={null}
        ageYears={null} blockedErrorFor={() => undefined} scrollToSection={() => {}} shownField={shownField} />
    )
  }
  const labels = (tree: ReturnType<typeof render>) => JSON.stringify(tree.toJSON())

  it("hides a baseline question the hospital switched off, and only that one", () => {
    const all = labels(render(<Harness shownField={() => true} />))
    const withoutSmoking = labels(render(<Harness shownField={field => field !== "smoking"} />))
    expect(all).toContain("\"smoking\"")
    expect(withoutSmoking).not.toContain("\"smoking\"")
    expect(withoutSmoking).toContain("\"latexAllergy\"")
  })
})

describe("suggestions from the record", () => {
  const suggestion = [{ id: "s1", stableKey: "A12", proposedState: "YES" as const }]
  const render2 = (states: Record<string, PreopAnswerState>) => JSON.stringify(render(
    <PreopQuestionList profile={{ questions: [question("A12")] }} formSection="anamnesis" mode="ADULT"
      states={new Map(Object.entries(states))} onAnswer={vi.fn()} suggestions={suggestion} onReviewSuggestion={vi.fn()} tc={tc as never} language="en" />,
  ).toJSON())

  it("are offered on an unanswered question and never over the clinician's own answer", () => {
    expect(render2({})).toContain("preopSuggestionAccept")
    expect(render2({ A12: "NOT_ASKED" })).toContain("preopSuggestionAccept")
    expect(render2({ A12: "NO" })).not.toContain("preopSuggestionAccept")
  })
})
