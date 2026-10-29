// @vitest-environment jsdom

import { render } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import type { PreopAnswerState, PreopProfileQuestion } from "@lospor/core/preop-assessment"
import enMessages from "../../../messages/en.json"
import { PreopQuestionList } from "./PreopQuestionList"

const question: PreopProfileQuestion = {
  stableKey: "A12", enabled: true, required: false, sortOrder: 0, section: "ADULT_ADDITIONS", formSection: "anamnesis",
  parentKey: null, labelEn: "Pacemaker", labelBg: "Пейсмейкър", answerType: "CHOICE", applicability: [],
  allowUnknown: false, allowNotApplicable: false, conditionalRuleKey: null, omopDomain: "observation",
  omopConceptId: 0, omopSourceCode: null, options: [],
}

function text(states: Record<string, PreopAnswerState>) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <PreopQuestionList profile={{ questions: [question] }} formSection="anamnesis" mode="ADULT"
        states={new Map(Object.entries(states))} onAnswer={vi.fn()}
        suggestions={[{ id: "s1", stableKey: "A12", proposedState: "YES" }]} onReviewSuggestion={vi.fn()} />
    </NextIntlClientProvider>,
  ).container.textContent ?? ""
}

describe("suggestions from the record", () => {
  it("are offered on an unanswered question and never over the clinician's own answer", () => {
    expect(text({})).toContain(enMessages.preop.suggestionAccept)
    expect(text({ A12: "NO" })).not.toContain(enMessages.preop.suggestionAccept)
  })
})

// 10.0.0: pregnancy and breastfeeding are not asked of a man, and the MH
// group is drawn apart, under its own heading in the anamnesis.
describe("which rows a section draws", () => {
  const row = (stableKey: string, section: string, labelEn: string): PreopProfileQuestion =>
    ({ ...question, stableKey, section, labelEn, answerType: "BOOLEAN", formSection: "anamnesis" })
  const profile = { questions: [
    row("A13_PREGNANCY", "ADULT_ADDITIONS", "Pregnancy / possible pregnancy"),
    row("S4_HEAT_STROKE", "MH_SUSCEPTIBILITY", "Heat stroke in the past"),
    row("S1_PREVIOUS_ICU_ADMISSION", "SHARED_ADDITIONS", "Previous intensive care admission"),
  ].map((item, sortOrder) => ({ ...item, sortOrder })) }
  const draw = (props: Partial<React.ComponentProps<typeof PreopQuestionList>>) => render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <PreopQuestionList profile={profile} formSection="anamnesis" mode="ADULT" states={new Map()} onAnswer={vi.fn()} {...props} />
    </NextIntlClientProvider>,
  ).container.textContent ?? ""

  it("leaves pregnancy off for a man, and asks it of a woman or a patient whose sex is not yet recorded", () => {
    expect(draw({ sex: "MALE" })).not.toContain("Pregnancy")
    expect(draw({ sex: "FEMALE" })).toContain("Pregnancy")
    expect(draw({ sex: null })).toContain("Pregnancy")
  })

  it("draws only the MH group, or everything but it", () => {
    const only = draw({ groups: { only: "MH_SUSCEPTIBILITY" } })
    expect(only).toContain("Heat stroke")
    expect(only).not.toContain("intensive care")
    const rest = draw({ groups: { except: "MH_SUSCEPTIBILITY" } })
    expect(rest).not.toContain("Heat stroke")
    expect(rest).toContain("intensive care")
  })
})
