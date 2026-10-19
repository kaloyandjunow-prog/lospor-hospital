import React from "react"
import { describe, expect, it } from "vitest"
import { render } from "@/test/render"
import { CLINICAL_STRINGS } from "@/i18n/clinical-strings"
import { PreopSummaryCard } from "./PreopSummaryCard"

const tc = (language: "en" | "bg") => (key: string) => (CLINICAL_STRINGS[language] as Record<string, string>)[key] ?? key
const text = (tree: ReturnType<typeof render>) => JSON.stringify(tree.toJSON())

describe("the preop summary on the PWA", () => {
  it("shows the allergy frame, the whole questionnaire with follow-ups, and scores", () => {
    const shown = text(render(<PreopSummaryCard language="bg" tc={tc("bg")} data={{
      preop: { allergies: true, allergyDetails: "[{\"label\":\"Пеницилин\"}]", asaScore: "II", apfelScore: 3 },
      preopQuestionnaire: [
        { stableKey: "A11", parentKey: null, formSection: "airway", label: { en: "Dysphagia", bg: "Дисфагия" }, answer: "YES", option: null },
        { stableKey: "A11_L", parentKey: "A11", formSection: "airway", label: { en: "Liquids", bg: "Течности" }, answer: "NO", option: null },
        { stableKey: "SMOKING", parentKey: null, formSection: "anamnesis", label: { en: "Smoking", bg: "Тютюнопушене" }, answer: null, option: null },
      ],
      createdBy: { name: "А. Николов", title: "д-р" },
      user: { name: "С. Димитрова", title: "д-р" },
    }} />))
    expect(shown).toContain("АЛЕРГИЯ")
    expect(shown).toContain("Пеницилин")
    expect(shown).toContain("Дисфагия")
    expect(shown).toContain("Течности")
    // "No" and unanswered are shown too.
    expect(shown).toContain("\"Не\"")
    expect(shown).toContain("Тютюнопушене")
    expect(shown).toContain("\"—\"")
    expect(shown.indexOf("Анамнеза")).toBeLessThan(shown.indexOf("Дихателни пътища"))
    expect(shown).toContain("ASA II")
    expect(shown).toContain("Apfel 3 / 4")
    expect(shown).toContain("д-р С. Димитрова")
  })

  it("shows no questionnaire when there is none", () => {
    const shown = text(render(<PreopSummaryCard language="en" tc={tc("en")} data={{ preop: { allergies: false } }} />))
    expect(shown).toContain("No known allergies")
    expect(shown).not.toContain("Questionnaire")
  })
})

describe("the planned anaesthesia, the title and latex on the PWA summary", () => {
  it("shows the plan, the doctor's title once and latex once", () => {
    const shown = text(render(<PreopSummaryCard language="bg" tc={tc("bg")} data={{
      preop: { allergies: true, latexAllergy: true, allergyDetails: [{ label: "Латекс" }], plannedAnaesthesia: { techniques: ["GENERAL_TIVA"], airwayDevices: ["LMA"] } },
      createdBy: { name: "д-р А. Николов", title: "д-р" },
    }} />))
    expect(shown).toContain("Планирана анестезия")
    expect(shown).toContain("Обща анестезия: тотална интравенозна анестезия (ТИВА); Ларингеална маска (LMA)")
    expect(shown).not.toContain("д-р д-р")
    expect(shown).not.toContain("Латекс · Латекс")
  })
})
