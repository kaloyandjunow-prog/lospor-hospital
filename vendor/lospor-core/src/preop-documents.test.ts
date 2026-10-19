import { describe, expect, it } from "vitest"
import {
  allergyLine,
  consentWithAssignedFasting,
  titledName,
  BUNDLED_CONSENT_TEMPLATES,
  CONSENT_BLANK,
  canonicalConsentText,
  consentPopulationForAge,
  consentSections,
  consentSigners,
  consentTableColumns,
  consentTableRow,
  consentTechniquesToPrint,
  groupPreopQuestionnaire,
  parseConsentTechniques,
  preopQuestionnaireAnswerText,
  type PreopQuestionnaireItem,
  consentTextProblems,
  effectivePreopDocumentSettings,
  fillConsentFields,
  parseConsentText,
  preopAgeInYears,
  unknownConsentFields,
} from "./preop-documents"

describe("who consents (Закон за здравето чл. 87)", () => {
  it("gives a child under 14 the children's text, signed by a parent", () => {
    expect(consentPopulationForAge(7)).toBe("PEDIATRIC")
    expect(consentPopulationForAge(13.9)).toBe("PEDIATRIC")
    expect(consentSigners(7)).toEqual(["PARENT", "ANAESTHETIST"])
  })

  it("gives 14 to 18 the adult text, signed by the patient and a parent", () => {
    expect(consentPopulationForAge(14)).toBe("ADULT")
    expect(consentSigners(16)).toEqual(["PATIENT", "PARENT", "ANAESTHETIST"])
  })

  it("leaves the parent line off for an adult, and keeps it when the age is unknown", () => {
    expect(consentSigners(18)).toEqual(["PATIENT", "ANAESTHETIST"])
    expect(consentPopulationForAge(null)).toBe("ADULT")
    expect(consentSigners(null)).toEqual(["PATIENT", "PARENT", "ANAESTHETIST"])
  })
})

describe("the consent text format", () => {
  it("reads headings, paragraphs, lists and bold", () => {
    const blocks = parseConsentText("## Обща анестезия\n\n**Какво правим.** Ще Ви приспим.\nВтори ред.\n\nНе трябва да приемате:\n- вода — 2 часа;\n- храна — 8 часа.")
    expect(blocks).toEqual([
      { kind: "heading", text: [{ text: "Обща анестезия", bold: false }] },
      { kind: "paragraph", text: [{ text: "Какво правим.", bold: true }, { text: " Ще Ви приспим. Втори ред.", bold: false }] },
      { kind: "paragraph", text: [{ text: "Не трябва да приемате:", bold: false }] },
      { kind: "list", items: [[{ text: "вода — 2 часа;", bold: false }], [{ text: "храна — 8 часа.", bold: false }]] },
    ])
  })

  it("fills the case's fields, and leaves a line for the pen where there is no value", () => {
    expect(fillConsentFields("Операция: {{procedure}}. Хирург: {{surgeon}}. Дата: {{ date }}.", { procedure: "Херниотомия" }))
      .toBe(`Операция: Херниотомия. Хирург: {{surgeon}}. Дата: ${CONSENT_BLANK}.`)
    expect(unknownConsentFields("{{procedure}} {{surgeon}} {{surgeon}}")).toEqual(["surgeon"])
  })

  it("takes the fingerprint of one canonical form, whatever the line endings", () => {
    expect(canonicalConsentText("\r\nРед 1  \r\nРед 2\r\n\r\n")).toBe("Ред 1\nРед 2")
  })

  it("refuses an empty, overlong or unknown-field text", () => {
    expect(consentTextProblems({ title: "Съгласие", body: "Текст" })).toEqual([])
    expect(consentTextProblems({ title: " ", body: "" })).toEqual(["TITLE_EMPTY", "EMPTY"])
    expect(consentTextProblems({ title: "Съгласие", body: "x".repeat(40_001) })).toEqual(["TOO_LONG"])
    expect(consentTextProblems({ title: "Съгласие", body: "{{surgeon}}" })).toEqual(["UNKNOWN_FIELD"])
  })
})

describe("technique sections", () => {
  it("tags a heading without printing the tag, and refuses a tag LOSPOR does not know", () => {
    expect(parseConsentText("## Обща анестезия [general]")).toEqual([{ kind: "heading", text: [{ text: "Обща анестезия", bold: false }], technique: "general" }])
    expect(consentTextProblems({ title: "Съгласие", body: "## Хипноза [hypnosis]" })).toEqual(["UNKNOWN_TECHNIQUE"])
  })

  it("cuts the text into the introduction and one section per heading", () => {
    const { intro, sections } = consentSections(BUNDLED_CONSENT_TEMPLATES.ADULT.body)
    expect(intro.length).toBeGreaterThan(3)
    expect(sections.map(section => section.technique)).toEqual(["general", "neuraxial", "block", "sedation", "combined", "cvc", "arterial", "ventilation", null, null])
  })

  it("prints the ticked techniques and general anaesthesia, or every technique when none is ticked", () => {
    expect([...consentTechniquesToPrint(["block"])].sort()).toEqual(["block", "general"])
    expect(consentTechniquesToPrint([]).size).toBe(8)
    expect(parseConsentTechniques("block, general,hypnosis")).toEqual(["general", "block"])
  })

  it("makes a table of the shared lead-ins, word for word, and spans a section without them", () => {
    const { sections } = consentSections(BUNDLED_CONSENT_TEMPLATES.ADULT.body)
    const columns = consentTableColumns(sections)
    expect(columns).toEqual(["Какво правим.", "Какво да очаквате.", "Възможни усложнения."])
    const general = consentTableRow(sections[0]!, columns)
    expect("cells" in general && general.cells[0]![0]).toEqual({ kind: "paragraph", text: [{ text: "С помощта на венозни медикаменти и/или газ ще Ви приспим. Може да Ви бъде поставена дихателна тръба в трахеята или ларингеална маска в гърлото, а с помощта на апарат да бъде заместено дишането Ви.", bold: false }] })
    expect("span" in consentTableRow(sections[4]!, columns)).toBe(true)
  })
})

describe("the questionnaire on the summary", () => {
  const item = (stableKey: string, answer: PreopQuestionnaireItem["answer"], extra: Partial<PreopQuestionnaireItem> = {}): PreopQuestionnaireItem => ({
    stableKey, parentKey: null, formSection: "anamnesis", label: { en: stableKey, bg: stableKey }, answer, option: null, ...extra,
  })

  it("groups by the form's sections, each follow-up under its question", () => {
    const groups = groupPreopQuestionnaire([
      item("A11", "YES", { formSection: "airway" }),
      item("SMOKING", "NO"),
      item("A11_LIQUIDS", "YES", { parentKey: "A11", formSection: "airway" }),
    ])
    expect(groups.map(group => group.section)).toEqual(["anamnesis", "airway"])
    expect(groups[1]!.rows.map(row => [row.item.stableKey, row.depth])).toEqual([["A11", 0], ["A11_LIQUIDS", 1]])
  })

  it("prints no answers and unanswered questions too", () => {
    expect(preopQuestionnaireAnswerText(item("X", "NO"), "bg")).toBe("Не")
    expect(preopQuestionnaireAnswerText(item("X", null), "bg")).toBe("—")
    expect(preopQuestionnaireAnswerText(item("X", "YES", { option: { en: "Anorectal", bg: "Аноректална" } }), "bg")).toBe("Аноректална")
  })
})

describe("the bundled texts", () => {
  it("are valid as Status would save them, and end with a declaration", () => {
    for (const template of Object.values(BUNDLED_CONSENT_TEMPLATES)) {
      expect(consentTextProblems(template)).toEqual([])
      const blocks = parseConsentText(template.body)
      expect(blocks.filter(block => block.kind === "heading").length).toBeGreaterThanOrEqual(9)
      expect(blocks[blocks.length - 2]).toEqual({ kind: "heading", text: [{ text: "Декларация", bold: false }] })
    }
  })

  it("speak to the parent in the children's text and to the patient in the adult one", () => {
    expect(BUNDLED_CONSENT_TEMPLATES.PEDIATRIC.body).toContain("Вашето дете")
    expect(BUNDLED_CONSENT_TEMPLATES.ADULT.body).not.toContain("Вашето дете")
    expect(BUNDLED_CONSENT_TEMPLATES.PEDIATRIC.body).toContain("кърма — 4 часа")
  })
})

describe("the hospital's switches", () => {
  it("are off by default, and the consent needs the summary", () => {
    expect(effectivePreopDocumentSettings(null)).toEqual({ summaryEnabled: false, consentEnabled: false, layout: "B" })
    expect(effectivePreopDocumentSettings({ consentEnabled: true })).toEqual({ summaryEnabled: false, consentEnabled: false, layout: "B" })
    expect(effectivePreopDocumentSettings({ summaryEnabled: true, consentEnabled: true, layout: "D" })).toEqual({ summaryEnabled: true, consentEnabled: true, layout: "D" })
  })

  it("reads an unknown layout as B", () => {
    expect(effectivePreopDocumentSettings({ layout: "Z" as never }).layout).toBe("B")
  })
})

describe("the age that picks the text", () => {
  it("reads a child's age in its own unit, an adult's in years", () => {
    expect(preopAgeInYears({ ageValue: 18, ageUnit: "MONTHS" })).toBe(1.5)
    expect(preopAgeInYears({ ageValue: 15, ageUnit: "YEARS", ageYears: 15 })).toBe(15)
    expect(preopAgeInYears({ ageYears: 55 })).toBe(55)
    expect(preopAgeInYears(null)).toBeNull()
  })
})

describe("titledName", () => {
  it("puts the title in front of the name once", () => {
    expect(titledName({ name: "А. Николов", title: "д-р" })).toBe("д-р А. Николов")
    expect(titledName({ name: "д-р Светлозар Цветанов", title: "д-р" })).toBe("д-р Светлозар Цветанов")
    expect(titledName({ name: "Д-р С. Цветанов", title: "д-р" })).toBe("Д-р С. Цветанов")
    expect(titledName({ name: "А. Николов", title: "" })).toBe("А. Николов")
    expect(titledName({ name: " ", title: "д-р" })).toBeNull()
    expect(titledName(null)).toBeNull()
  })
})

describe("allergyLine", () => {
  it("names latex once", () => {
    expect(allergyLine(["Латекс"], true, "Латекс")).toBe("Латекс")
    expect(allergyLine(["Latex gloves"], true, "Latex")).toBe("Latex gloves")
    expect(allergyLine(["Пеницилин"], true, "Латекс")).toBe("Пеницилин · Латекс")
    expect(allergyLine(["Пеницилин", "Йод"], false, "Латекс")).toBe("Пеницилин, Йод")
    expect(allergyLine([], true, "Латекс")).toBe("Латекс")
  })
})


describe("consentWithAssignedFasting", () => {
  const child = BUNDLED_CONSENT_TEMPLATES.PEDIATRIC.body
  it("prints the hours assigned at the preop visit in the fasting list", () => {
    const text = consentWithAssignedFasting(child, [
      { category: "SOLID_FOOD_OR_COW_MILK", hoursBefore: 6 },
      { category: "CLEAR_FLUIDS", hoursBefore: 1 },
      { category: "BREAST_MILK", hoursBefore: 4 },
    ])
    expect(text).toContain("- вода или чай — 1 час преди анестезията;\n- кърма — 4 часа преди анестезията;\n- друга храна или краве мляко — 6 часа преди анестезията.")
    expect(text).not.toContain("друга храна — 8 часа")
    expect(text).toContain("## Декларация")
  })

  it("keeps the text when nothing is assigned or there is no fasting heading", () => {
    expect(consentWithAssignedFasting(child, [])).toBe(child)
    expect(consentWithAssignedFasting("## Обща анестезия\n\nТекст.", [{ category: "CLEAR_FLUIDS", hoursBefore: 1 }])).toBe("## Обща анестезия\n\nТекст.")
  })

  it("adds the list to a fasting section that has none, in the heading's language", () => {
    expect(consentWithAssignedFasting("## Fasting\n\nPlease follow these hours.\n\n## Declaration", [{ category: "CLEAR_FLUIDS", hoursBefore: 2 }]))
      .toBe("## Fasting\n\nPlease follow these hours.\n- water or tea — 2 hours before anaesthesia.\n\n## Declaration")
  })
})
