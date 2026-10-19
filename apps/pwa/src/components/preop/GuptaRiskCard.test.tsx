import React from "react"
import { describe, expect, it, vi } from "vitest"
import { GUPTA_FUNCTIONAL_STATUS, GUPTA_PROCEDURE_TYPES } from "@lospor/core/gupta"
import type { PreopProfileQuestion } from "@lospor/core/preop-assessment"
import { pressByText, queryByText, render } from "@/test/render"
import { CLINICAL_STRINGS } from "@/i18n/clinical-strings"
import { GuptaRiskCard } from "./GuptaRiskCard"
import { PreopQuestionList } from "./PreopQuestionList"

const tc = (key: string) => (CLINICAL_STRINGS.en as Record<string, string>)[key] ?? key
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc }) }))

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
const card = (values: Record<string, unknown>, onAnswer = vi.fn(), enabled = true) =>
  render(<GuptaRiskCard profile={profile(enabled)} values={values} onAnswer={onAnswer} tc={tc as never} language="en" />)
const text = (tree: ReturnType<typeof render>) => JSON.stringify(tree.toJSON())

describe("Gupta on the PWA preop form", () => {
  it("shows nothing while the hospital has it switched off", () => {
    expect(card({}, vi.fn(), false).toJSON()).toBeNull()
  })

  it("names what is missing, then shows the risk once every input is there", () => {
    expect(text(card({ ageYears: 68, asaScore: "III" }))).toContain("Needs: functional status, procedure type")
    const ready = card({
      ageYears: 68, asaScore: "III",
      labResults: [{ test: "Creatinine", value: "1.0", unit: "mg/dL" }],
      preopAnswers: [
        { stableKey: "A15_FUNCTIONAL_STATUS", state: "YES", optionKey: "INDEPENDENT" },
        { stableKey: "A16_GUPTA_PROCEDURE_TYPE", state: "YES", optionKey: "PERIPHERAL_VASCULAR" },
      ],
    })
    expect(queryByText(ready, "0.7% · Low")).not.toBeNull()
  })

  it("offers the procedure type the planned procedure suggests, and fills it only on request", () => {
    const onAnswer = vi.fn()
    const tree = card({ procedures: [{ label: "Cholecystectomy", group: "Cholecystectomy" }] }, onAnswer)
    expect(onAnswer).not.toHaveBeenCalled()
    pressByText(tree, "Use")
    expect(onAnswer).toHaveBeenCalledWith("A16_GUPTA_PROCEDURE_TYPE", { stableKey: "A16_GUPTA_PROCEDURE_TYPE", state: "YES", optionKey: "GALLBLADDER_APPENDIX_ADRENAL_SPLEEN" })
  })

  it("asks a choice question with its own options, stored as YES plus the option", () => {
    const onAnswer = vi.fn()
    const tree = render(
      <PreopQuestionList profile={profile(true)} formSection="risk_scores" mode="ADULT"
        states={new Map([["A15_FUNCTIONAL_STATUS", "YES"]])} optionKeys={new Map([["A15_FUNCTIONAL_STATUS", "INDEPENDENT"]])}
        onAnswer={onAnswer} tc={tc as never} language="en" />,
    )
    expect(queryByText(tree, "Independent")).not.toBeNull()
    pressByText(tree, "Independent")
    pressByText(tree, "Totally dependent: needs help with all daily activities")
    expect(onAnswer).toHaveBeenCalledWith("A15_FUNCTIONAL_STATUS", { stableKey: "A15_FUNCTIONAL_STATUS", state: "YES", optionKey: "TOTALLY_DEPENDENT" })
  })
})
