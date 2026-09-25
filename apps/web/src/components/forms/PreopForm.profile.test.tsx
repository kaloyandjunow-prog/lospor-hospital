// @vitest-environment jsdom

import { act, fireEvent, render } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import type { PreopAssessmentProfile, PreopFormSection, PreopProfileQuestion } from "@lospor/core/preop-assessment"
import enMessages from "../../../messages/en.json"

vi.mock("@/hooks/useOptionLibrary", () => ({
  useOptionLibrary: () => ({ options: [], loading: false, source: "bundled" }),
  useRange: () => ({ min: 0, max: 300, step: 1, unit: "" }),
}))

vi.mock("@/lib/deployment-capabilities", () => ({
  capabilityMessageKey: () => "deploymentCapabilities.externalAiUnavailable",
  pediatricCapabilityMessageKey: () => "newSelectionUnavailable",
  // Appliance-only: PreopForm reads it to decide whether to offer the
  // hospital's own data. Off here, so this test sees the plain form.
  useEhrImportCapability: () => ({
    enabled: false,
    reason: "PROVIDER_NOT_CONFIGURED",
    transport: null,
    egnPermitted: false,
  }),
  useClinicalAiCapabilities: () => ({
    clinicalAdvice: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
    labImageExtraction: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
    monitorOcr: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
  }),
  usePediatricModeCapability: () => ({
    enabled: false, reason: "CAPABILITY_UNAVAILABLE", productionReady: false,
    rulesetVersion: null, minimumClientVersion: null, reviewedDoseProfilesRequired: false,
  }),
}))

import { PreopForm } from "./PreopForm"

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

const BASELINE = [
  "BASE_ALLERGIES", "BASE_LATEX_ALLERGY", "BASE_SMOKING", "BASE_SUBSTANCE_ABUSE",
  "BASE_RCRI_ISCHEMIC_HEART", "BASE_RCRI_CHF", "BASE_RCRI_CVD", "BASE_RCRI_INSULIN_DM", "BASE_RCRI_CREATININE",
  "BASE_SURGERY_RISK", "BASE_HEART_ARRHYTHMIA",
]

function profile(questions: PreopProfileQuestion[]): PreopAssessmentProfile {
  return { id: "p", version: 1, catalogVersion: "1.4.8", status: "PUBLISHED", publishedAt: null, questions }
}

function renderForm(preopProfile: PreopAssessmentProfile | null, layoutMode: "tabs" | "scroll" = "scroll") {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <PreopForm defaultValues={{ clinicalMode: "ADULT" }} onSubmit={vi.fn()} onAutoSave={vi.fn()} layoutMode={layoutMode} preopProfile={preopProfile} />
    </NextIntlClientProvider>,
  )
}

const yesButton = (container: HTMLElement, id: string) => container.querySelector(`[aria-label="${id}: Yes"]`)

describe.each(["scroll", "tabs"] as const)("the preoperative form driven by the profile (%s layout)", layoutMode => {
  it("keeps the bundled baseline when there is no profile, and draws no extra questions", () => {
    const { container } = renderForm(null, layoutMode)
    expect(yesButton(container, "smoking")).not.toBeNull()
    expect(container.querySelector("[data-testid^='preop-questions-']")).toBeNull()
  })

  it("hides a baseline question the hospital switched off", () => {
    const { container } = renderForm(profile([
      ...BASELINE.map(key => question(key, { enabled: key !== "BASE_SMOKING" })),
    ]), layoutMode)
    expect(yesButton(container, "smoking")).toBeNull()
    expect(yesButton(container, "latexAllergy")).not.toBeNull()
  })

  it("draws every switched-on addition in its own section, grouped, when all are on", () => {
    const additions: PreopProfileQuestion[] = [
      ...Array.from({ length: 40 }, (_, index) => question(`A_MANY_${index}`)),
      question("A12_PACEMAKER_ICD", { formSection: "physical_exam" as PreopFormSection }),
      question("A11_DYSPHAGIA_ASPIRATION", { formSection: "airway" as PreopFormSection }),
      question("A13_PREGNANCY", { formSection: "demographics" as PreopFormSection, section: "CASE" }),
    ]
    const { getByTestId } = renderForm(profile([...BASELINE.map(key => question(key)), ...additions]), layoutMode)
    expect(getByTestId("preop-questions-anamnesis").querySelectorAll("[data-testid^='preop-question-']")).toHaveLength(40)
    expect(getByTestId("preop-questions-physical_exam").textContent).toContain("Label A12_PACEMAKER_ICD")
    expect(getByTestId("preop-questions-airway").textContent).toContain("Label A11_DYSPHAGIA_ASPIRATION")
    expect(getByTestId("preop-questions-demographics").textContent).toContain("Label A13_PREGNANCY")
    expect(getByTestId("preop-questions-anamnesis").textContent).toContain("0 of 40 answered")
  })

  it("shows a follow-up only once its parent is answered yes", async () => {
    const { container, queryByTestId } = renderForm(profile([
      question("A1_RECENT_INFECTION"),
      question("A1_RECENT_INFECTION_TWO_WEEKS", { parentKey: "A1_RECENT_INFECTION" }),
    ]), layoutMode)
    expect(queryByTestId("preop-question-A1_RECENT_INFECTION_TWO_WEEKS")).toBeNull()
    await act(async () => { fireEvent.click(yesButton(container, "preop-question-A1_RECENT_INFECTION")!) })
    expect(queryByTestId("preop-question-A1_RECENT_INFECTION_TWO_WEEKS")).not.toBeNull()
  })

  it("marks a required question", () => {
    const { getByTestId } = renderForm(profile([question("A12_PACEMAKER_ICD", { required: true })]), layoutMode)
    expect(getByTestId("preop-question-A12_PACEMAKER_ICD").textContent).toContain("*")
  })

  it("does not compute a score whose input is switched off", () => {
    const { container } = renderForm(profile(BASELINE.map(key => question(key, { enabled: key !== "BASE_RCRI_CHF" }))), layoutMode)
    expect(container.textContent).toContain(enMessages.preop.scoreUnavailable)
  })
})
