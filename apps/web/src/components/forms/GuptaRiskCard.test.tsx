// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import { GUPTA_FUNCTIONAL_STATUS, GUPTA_PROCEDURE_TYPES } from "@lospor/core/gupta"
import type { PreopProfileQuestion } from "@lospor/core/preop-assessment"
import enMessages from "../../../messages/en.json"
import { GuptaRiskCard } from "./GuptaRiskCard"
import { PreopQuestionList } from "./PreopQuestionList"

const choice = (stableKey: string, options: readonly { key: string; labelEn: string; labelBg: string }[], enabled = true): PreopProfileQuestion => ({
  stableKey, enabled, required: false, sortOrder: 0, section: "ADULT_ADDITIONS", formSection: "risk_scores",
  parentKey: null, labelEn: stableKey, labelBg: stableKey, answerType: "CHOICE", applicability: ["ADULT"],
  allowUnknown: false, allowNotApplicable: false, conditionalRuleKey: null, omopDomain: "observation",
  omopConceptId: 0, omopSourceCode: null,
  options: options.map(({ key, labelEn, labelBg }) => ({ key, labelEn, labelBg, omopConceptId: null, omopVocabulary: null, omopSourceCode: null })),
})
const profile = (enabled: boolean) => ({ questions: [
  choice("A15_FUNCTIONAL_STATUS", GUPTA_FUNCTIONAL_STATUS, enabled),
  choice("A16_GUPTA_PROCEDURE_TYPE", GUPTA_PROCEDURE_TYPES, enabled),
] })
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={enMessages}>{node}</NextIntlClientProvider>)

describe("Gupta on the web preop form", () => {
  it("shows nothing while the hospital has it switched off", () => {
    wrap(<GuptaRiskCard profile={profile(false)} values={{}} onAnswer={vi.fn()} />)
    expect(screen.queryByTestId("gupta-risk-card")).toBeNull()
  })

  it("names what is missing, then shows the risk once every input is there", () => {
    const { rerender } = wrap(<GuptaRiskCard profile={profile(true)} values={{ ageYears: 68, asaScore: "III" }} onAnswer={vi.fn()} />)
    expect(screen.getByTestId("gupta-risk-card").textContent).toContain("Needs: functional status, procedure type")
    rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <GuptaRiskCard profile={profile(true)} onAnswer={vi.fn()} values={{
          ageYears: 68, asaScore: "III",
          preopAnswers: [
            { stableKey: "A15_FUNCTIONAL_STATUS", state: "YES", optionKey: "INDEPENDENT" },
            { stableKey: "A16_GUPTA_PROCEDURE_TYPE", state: "YES", optionKey: "PERIPHERAL_VASCULAR" },
          ],
        }} />
      </NextIntlClientProvider>,
    )
    // No creatinine result is the model's "unknown" (-0.10), not normal: 0.6%, not 0.7%.
    expect(screen.getByText("0.6% · Low")).toBeTruthy()
    expect(screen.getByText(enMessages.preop.gupta.creatinineUnknown)).toBeTruthy()
  })

  it("offers the procedure type the planned procedure suggests, and fills it only on request", () => {
    const onAnswer = vi.fn()
    wrap(<GuptaRiskCard profile={profile(true)} onAnswer={onAnswer} values={{ procedures: [{ label: "Cholecystectomy", group: "Cholecystectomy" }] }} />)
    expect(onAnswer).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText(enMessages.preop.gupta.use))
    expect(onAnswer).toHaveBeenCalledWith("A16_GUPTA_PROCEDURE_TYPE", { stableKey: "A16_GUPTA_PROCEDURE_TYPE", state: "YES", optionKey: "GALLBLADDER_APPENDIX_ADRENAL_SPLEEN" })
  })

  it("asks a choice question with its own options, stored as YES plus the option", () => {
    const onAnswer = vi.fn()
    wrap(<PreopQuestionList profile={profile(true)} formSection="risk_scores" mode="ADULT" states={new Map([["A15_FUNCTIONAL_STATUS", "YES"]])}
      optionKeys={new Map([["A15_FUNCTIONAL_STATUS", "INDEPENDENT"]])} onAnswer={onAnswer} />)
    const select = document.getElementById("preop-question-A15_FUNCTIONAL_STATUS") as HTMLSelectElement
    expect(select.value).toBe("INDEPENDENT")
    fireEvent.change(select, { target: { value: "TOTALLY_DEPENDENT" } })
    expect(onAnswer).toHaveBeenCalledWith("A15_FUNCTIONAL_STATUS", { stableKey: "A15_FUNCTIONAL_STATUS", state: "YES", optionKey: "TOTALLY_DEPENDENT" })
    expect((document.getElementById("preop-question-A16_GUPTA_PROCEDURE_TYPE") as HTMLSelectElement).options).toHaveLength(22)
  })
})
