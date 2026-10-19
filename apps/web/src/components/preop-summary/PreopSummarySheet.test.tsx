// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { BUNDLED_CONSENT_TEMPLATES, type PreopDocumentLayout, type PreopQuestionnaireItem } from "@lospor/core/preop-documents"
import { ConsentSheet } from "./ConsentSheet"
import { preopDocumentPages } from "./PreopDocumentPages"
import { PreopSummarySheet, type PreopSummaryData } from "./PreopSummarySheet"

const PRINTED = new Date("2026-10-16T08:00:00Z")

const question = (stableKey: string, answer: PreopQuestionnaireItem["answer"], extra: Partial<PreopQuestionnaireItem> = {}): PreopQuestionnaireItem => ({
  stableKey, parentKey: null, formSection: "anamnesis", label: { en: stableKey, bg: stableKey }, answer, option: null, ...extra,
})

const QUESTIONNAIRE = [
  question("A11_DYSPHAGIA_ASPIRATION", "YES", { formSection: "airway", label: { en: "Dysphagia", bg: "Дисфагия" } }),
  question("A11_LIQUIDS", "YES", { formSection: "airway", parentKey: "A11_DYSPHAGIA_ASPIRATION", label: { en: "Liquids", bg: "Течности" } }),
  question("BASE_SMOKING", "NO", { label: { en: "Smoking", bg: "Тютюнопушене" } }),
  question("BASE_RCRI_CHF", null, { label: { en: "Heart failure", bg: "Сърдечна недостатъчност" } }),
]

const ADULT_TEMPLATE = { population: "ADULT" as const, version: 3, sha256: "b".repeat(64), ...BUNDLED_CONSENT_TEMPLATES.ADULT }
const CHILD_TEMPLATE = { population: "PEDIATRIC" as const, version: 0, sha256: "a".repeat(64), ...BUNDLED_CONSENT_TEMPLATES.PEDIATRIC }

function data(preop: Record<string, unknown>, extra: Partial<PreopSummaryData> = {}, layout: PreopDocumentLayout = "B"): PreopSummaryData {
  return {
    caseCode: "2026-0007",
    institution: { name: "МБАЛ Пример", city: "София" },
    intraop: { timezone: "Europe/Sofia" },
    createdBy: { name: "А. Николов", title: "д-р" },
    user: { name: "А. Николов", title: "д-р" },
    preop: { ageYears: 55, sex: "FEMALE", heightCm: 164, weightKg: 78, allergies: false, latexAllergy: false, ...preop },
    preopDocuments: { summaryEnabled: true, consentEnabled: true, layout, templates: { ADULT: ADULT_TEMPLATE, PEDIATRIC: CHILD_TEMPLATE } },
    preopQuestionnaire: QUESTIONNAIRE,
    ...extra,
  } as unknown as PreopSummaryData
}

function renderPages(source: PreopSummaryData, locale = "bg", techniques: Parameters<typeof preopDocumentPages>[0]["techniques"] = []) {
  return render(<>{preopDocumentPages({ data: source, locale, printedAt: PRINTED, techniques }).map(({ key, page }) => <div key={key} data-page={key}>{page}</div>)}</>)
}

describe("the preop summary sheet", () => {
  it("prints the whole questionnaire: yes, no and unanswered, follow-ups under their question", () => {
    render(<PreopSummarySheet locale="bg" printedAt={PRINTED} data={data({ allergies: true, allergyDetails: "[{\"label\":\"Латекс\"}]", asaScore: "II", apfelScore: 3, plannedProcedure: "Хистеректомия", elective: true })} />)
    expect(screen.getByTestId("preop-summary-allergy").textContent).toBe("АЛЕРГИЯ: Латекс")
    const questionnaire = screen.getByTestId("preop-questionnaire").textContent ?? ""
    expect(questionnaire).toContain("ТютюнопушенеНе")
    expect(questionnaire).toContain("Сърдечна недостатъчност—")
    expect(questionnaire).toContain("– ТечностиДа")
    expect(questionnaire.indexOf("Анамнеза")).toBeLessThan(questionnaire.indexOf("Дихателни пътища"))
    expect(screen.getByTestId("preop-summary-scores").textContent).toContain("Apfel 3 / 4")
    expect(screen.getByText("Хистеректомия · планова")).toBeTruthy()
  })

  it("leaves the name and ID as lines for the pen, and the plan to be written by hand", () => {
    render(<PreopSummarySheet locale="en" printedAt={PRINTED} data={data({})} />)
    const sheet = screen.getByTestId("preop-summary-sheet")
    expect(sheet.textContent).toContain("Patient name")
    expect(sheet.textContent).toContain("Conclusion")
  })

  it("names the colleague the case was handed to", () => {
    render(<PreopSummarySheet locale="en" printedAt={PRINTED} data={data({}, { user: { name: "S. Dimitrova", title: "Dr" } })} />)
    expect(screen.getByTestId("preop-summary-sheet").textContent).toContain("Handed over for the intraoperative stage to:Dr S. Dimitrova")
  })

  it("prints no airway heading without an airway value", () => {
    render(<PreopSummarySheet locale="en" printedAt={PRINTED} data={data({}, { preopQuestionnaire: [] })} />)
    expect(screen.getByTestId("preop-summary-sheet").textContent).not.toContain("Airway")
  })
})

describe("layout A: Document №2", () => {
  it("prints the questionnaire under yes and no columns, and the report for the pen", () => {
    renderPages(data({ ageValue: 7, ageUnit: "YEARS", ageYears: 7, pediatricFasting: [{ category: "CLEAR_FLUIDS", hoursBefore: 1 }] }, {}, "A"))
    const sheet = screen.getByTestId("preop-summary-sheet")
    expect(sheet.dataset.layout).toBe("A")
    expect(sheet.textContent).toContain("Лист за предоперативна анестезиологична консултация на деца от 0 до 14 г.")
    const rows = screen.getByTestId("preop-questionnaire").querySelectorAll("tr[data-answer]")
    const smoking = [...rows].find(row => row.textContent?.startsWith("Тютюнопушене"))!
    expect(smoking.querySelectorAll("td")[2]!.textContent).toBe("Х")
    expect(sheet.textContent).toContain("Да спре приема на вода 1 часа преди операцията")
    // The children's text, signed by a parent.
    expect(screen.getByTestId("consent-signers").textContent).toContain("Родител")
  })
})

describe("layout C: the consent per technique", () => {
  it("describes the ticked techniques and general anaesthesia, each with a box for initials, and names the rest", () => {
    renderPages(data({}, {}, "C"), "bg", ["block"])
    expect(screen.getByTestId("preop-summary-techniques").textContent).toContain("Периферен нервен блок")
    const consent = screen.getByTestId("consent-sheet")
    const described = [...consent.querySelectorAll("[data-technique]")].map(node => (node as HTMLElement).dataset.technique)
    expect(described).toEqual(["general", "block"])
    expect(consent.textContent).toContain("Инициали")
    expect(screen.getByTestId("consent-not-planned").textContent).toContain("Канюлиране на артерия")
    expect(consent.textContent).toContain("Декларация")
  })
})

describe("layout D: one sheet, both sides", () => {
  it("prints a dense front with the emergency frame, and the consent as a word-for-word table", () => {
    renderPages(data({ emergencySurgery: true }, {}, "D"))
    expect(screen.getByTestId("preop-summary-emergency")).toBeTruthy()
    const table = screen.getByTestId("consent-table")
    expect(table.querySelectorAll("tbody tr")).toHaveLength(8)
    expect(table.textContent).toContain("С помощта на венозни медикаменти и/или газ ще Ви приспим.")
  })
})

describe("layout E: a copy for the hospital and one for the patient", () => {
  it("has the hospital's copy signed, and a take-home page and the full text without signatures", () => {
    renderPages(data({ ageValue: 7, ageUnit: "YEARS", ageYears: 7, pediatricFasting: [{ category: "BREAST_MILK", hoursBefore: 4 }] }, {}, "E"))
    expect(screen.getByTestId("preop-summary-acknowledgement").textContent).toContain("анестезията на детето си")
    expect(screen.getByTestId("consent-signers").textContent).toContain("Родител")
    expect(screen.getByTestId("preop-patient-fasting").textContent).toContain("Кърма4 ч преди операцията")
    const keep = screen.getByTestId("consent-keep")
    expect(keep.textContent).toContain("Екземпляр за родителя")
    expect(keep.querySelector("[data-testid=consent-signers]")).toBeNull()
  })
})

describe("the consent pages", () => {
  it("prints the text without its technique tags, and the parent signs for a child under 14", () => {
    render(<ConsentSheet template={CHILD_TEMPLATE} values={{ procedure: "Херниотомия" }} ageYears={7} locale="bg" caseCode="2026-0007" />)
    const sheet = screen.getByTestId("consent-sheet")
    expect(sheet.textContent).toContain("Обща анестезия")
    expect(sheet.textContent).not.toContain("[general]")
    expect(sheet.textContent).toContain("Херниотомия")
    expect(screen.getByTestId("consent-signers").textContent).toMatch(/^Родител, настойник, попечител.*Лекар анестезиолог/)
    expect(sheet.textContent).toContain("вграден")
  })

  it("has the patient and a parent sign from 14 to 18", () => {
    render(<ConsentSheet template={ADULT_TEMPLATE} values={{}} ageYears={16} locale="bg" />)
    const signers = screen.getByTestId("consent-signers").textContent ?? ""
    expect(signers).toContain("Пациент")
    expect(signers).toContain("Родител")
    expect(screen.getByTestId("consent-sheet").textContent).toContain("вариант 3")
  })

  it("prints only the summary when the consent is off", () => {
    const off = data({})
    off.preopDocuments = { summaryEnabled: true, consentEnabled: false, layout: "B", templates: null }
    renderPages(off)
    expect(screen.queryByTestId("consent-sheet")).toBeNull()
  })
})

describe("the planned anaesthesia", () => {
  it("prints on the plan and the consent's line when recorded", () => {
    renderPages(data({ plannedAnaesthesia: { techniques: ["GENERAL_TIVA"], airwayDevices: ["LMA"], vascularAccesses: [{ site: "ART_RADIAL" }] } }))
    expect(screen.getByTestId("preop-summary-sheet").textContent).toContain("Обща анестезия: тотална интравенозна анестезия (ТИВА); Ларингеална маска (LMA); Артериален достъп (Arteria radialis)")
    expect(screen.getByTestId("consent-planned-anaesthesia").textContent).toBe("Обща анестезия: тотална интравенозна анестезия (ТИВА); Ларингеална маска (LMA); Артериален достъп (Arteria radialis)")
  })

  it("leaves both lines for the pen when nothing is planned", () => {
    renderPages(data({}))
    expect(screen.queryByTestId("consent-planned-anaesthesia")).toBeNull()
  })

  it("prints the doctor's title once and latex once", () => {
    renderPages(data({ allergies: true, latexAllergy: true, allergyDetails: [{ label: "Латекс" }] }, { createdBy: { name: "д-р А. Николов", title: "д-р" } }))
    expect(screen.getByTestId("preop-summary-allergy").textContent).toBe("АЛЕРГИЯ: Латекс")
    expect(screen.getByTestId("preop-summary-sheet").textContent).not.toContain("д-р д-р")
  })
})

describe("the consent's fasting list", () => {
  it("prints the hours assigned to the child at the preop visit", () => {
    renderPages(data({ ageYears: 7, pediatricFasting: [
      { category: "CLEAR_FLUIDS", hoursBefore: 1, policyId: "APAGBI_FASTING", policyVersion: "2023" },
      { category: "SOLID_FOOD_OR_COW_MILK", hoursBefore: 6, policyId: "APAGBI_FASTING", policyVersion: "2023" },
    ] }))
    const consent = screen.getByTestId("consent-sheet").textContent ?? ""
    expect(consent).toContain("вода или чай — 1 час преди анестезията;")
    expect(consent).toContain("друга храна или краве мляко — 6 часа преди анестезията.")
    expect(consent).not.toContain("друга храна — 8 часа")
  })
})
