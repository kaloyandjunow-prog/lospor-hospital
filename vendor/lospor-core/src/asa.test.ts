import { describe, expect, it } from "vitest"
import { asaReasonLabel, asaSuggestionRule, suggestASAFromTags } from "./asa"
import { asaAgreementByRule } from "./research"

describe("the ASA suggestion", () => {
  it("rises with the most severe coded condition", () => {
    expect(suggestASAFromTags([{ label: "Hypertension", code: "I10" }], 26)?.cls).toBe("II")
    expect(suggestASAFromTags([{ label: "COPD", code: "J44.9" }, { label: "Hypertension", code: "I10" }], 26)?.cls).toBe("III")
    expect(suggestASAFromTags([], 42)?.cls).toBe("III")
  })

  // Nothing coded and a normal BMI is missing information, not a healthy
  // patient: suggesting ASA I there contradicted clinicians choosing III.
  it("suggests nothing when there is nothing to base it on", () => {
    expect(suggestASAFromTags([], 27.1)).toBeNull()
    expect(suggestASAFromTags([], null)).toBeNull()
  })
})

describe("agreement with the ASA suggestion, per rule", () => {
  const rows = (count: number, suggested: string, chosen: string, reasons: string[]) =>
    Array.from({ length: count }, () => ({ suggested, chosen, reasons }))

  it("counts agreement and which way anaesthetists departed", () => {
    const [copd] = asaAgreementByRule([
      ...rows(6, "III", "III", ["copd"]),
      ...rows(9, "III", "II", ["copd"]),
      ...rows(5, "III", "IV", ["copd"]),
    ])
    expect(copd).toEqual({ reasonCode: "copd", suggested: "III", cases: 20, agreed: 6, choseLower: 9, choseHigher: 5, suppressed: false })
  })

  it("hides a small rule, and a small part with the next smallest", () => {
    const result = asaAgreementByRule([
      ...rows(3, "II", "II", ["asthma"]),
      ...rows(12, "II", "II", ["hypertension"]),
      ...rows(2, "II", "III", ["hypertension"]),
      ...rows(7, "II", "I", ["hypertension"]),
    ])
    expect(result.find(row => row.reasonCode === "asthma")).toMatchObject({ cases: null, agreed: null, suppressed: true })
    expect(result.find(row => row.reasonCode === "hypertension")).toMatchObject({ cases: 21, agreed: 12, choseLower: null, choseHigher: null, suppressed: true })
  })

  it("ignores cases with no suggestion or no chosen class", () => {
    expect(asaAgreementByRule([{ suggested: null, chosen: "II", reasons: [] }, { suggested: "II", chosen: null, reasons: ["asthma"] }])).toEqual([])
  })

  it("knows every reason code the suggestion can give", () => {
    expect(asaSuggestionRule("copd")).toEqual({ cls: "III", label: "COPD" })
    expect(asaSuggestionRule("morbid_obesity_bmi")?.cls).toBe("III")
    expect(asaSuggestionRule("comorbidities_present")?.cls).toBe("II")
    expect(asaSuggestionRule("nonsense")).toBeNull()
  })
})

describe("the ASA rules in Bulgarian", () => {
  it("names every reason a suggestion can give in both languages", () => {
    const tags = [
      "N18.6", "N18.5", "I50.2", "I50.3", "I50.9", "I21.0", "I25.1", "I63.9", "I64", "G45.9", "Z95.0", "Z95.1", "J44.9",
      "E10.9", "K70.3", "K74.6", "N18.3", "Z99.2", "G20", "F10.2", "F19.2", "Z86.7", "I10", "I11.9",
      "I48.0", "I49.9", "I73.9", "I83.9", "I82.9", "J45.9", "E11.9", "E03.9", "E05.9", "E04.9", "G40.9", "G43.9", "F32.9",
      "F33.9", "F41.9", "K25.9", "K26.9", "K27.9", "K29.7", "K57.9", "K21.9", "K73.9", "D50.9", "D51.9", "D64.9", "M05.9", "M06.9", "M81.9", "Z87.3", "F17.2",
    ].map(code => suggestASAFromTags([{ label: code, code }], null)!)
    for (const suggestion of tags) {
      for (const code of suggestion.reasonCodes) {
        const bg = asaReasonLabel(code, "bg")
        expect(bg, code).not.toBe(code)
        expect(bg, code).toMatch(/[а-яА-Я]|ХОББ|ТИА|ИКД/)
        expect(asaReasonLabel(code, "en"), code).not.toBe(bg)
      }
    }
  })

  it("names the patient's own BMI", () => {
    expect(asaReasonLabel("morbid_obesity_bmi", "bg", 41.25)).toBe("Морбидно затлъстяване (ИТМ 41,3)")
    expect(asaReasonLabel("obesity_bmi", "en", 32)).toBe("Obesity (BMI 32.0)")
  })

  // Z95.1 in WHO ICD-10 is the presence of an aortocoronary bypass graft.
  it("calls Z95.1 a coronary bypass graft", () => {
    expect(asaReasonLabel(suggestASAFromTags([{ label: "Z95.1", code: "Z95.1" }], null)!.reasonCodes[0]!, "en")).toBe("Coronary artery bypass graft")
  })
})

describe("the ASA rules aligned with WHO ICD-10 and the ASA examples", () => {
  const cls = (code: string) => suggestASAFromTags([{ label: code, code }], null)?.cls
  it("puts an acute MI at IV", () => expect(cls("I21.9")).toBe("IV"))
  it("no longer reads unspecified obesity as morbid", () => expect(cls("E66.9")).toBe("II"))
  it("reads a past circulatory disease as II", () => expect(cls("Z86.7")).toBe("II"))
  it("covers peptic ulcers", () => {
    expect(suggestASAFromTags([{ label: "K25.9", code: "K25.9" }], null)?.reasonCodes).toEqual(["gastric_ulcer"])
    expect(suggestASAFromTags([{ label: "K27.9", code: "K27.9" }], null)?.reasonCodes).toEqual(["peptic_ulcer"])
  })
})
