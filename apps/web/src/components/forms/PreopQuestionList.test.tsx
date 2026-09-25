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
