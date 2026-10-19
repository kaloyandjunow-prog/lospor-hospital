import { describe, expect, it } from "vitest"
import { buildPreopSectionItems, type PreopSectionLabel, type PreopSectionOverviewText } from "./preop-section-overview"

const labels: PreopSectionLabel[] = [
  { key: "patient", label: "Patient" },
  { key: "case", label: "Case" },
  { key: "history", label: "History" },
  { key: "meds", label: "Meds" },
  { key: "anamnesis", label: "Anamnesis" },
  { key: "exam", label: "Exam" },
  { key: "airway", label: "Airway" },
  { key: "labs", label: "Labs" },
  { key: "risk", label: "Risk" },
]

const text: PreopSectionOverviewText = {
  patientHint: "patient required",
  diagnosisAndProcedure: "diagnosis and procedure",
  comorbidities: "comorbidities hint",
  meds: "meds hint",
  flags: "flags hint",
  vitalsRequired: "vitals required",
  mallampatiRequired: "mallampati required",
  labsHint: "labs hint",
  asaRequired: "asa required",
  age: "{age}y", sexMale: "M", sexFemale: "F", comorbidityCount: "{count} comorbidities",
  medicationCount: "{count} medications", resultCount: "{count} results",
  allergy: "Allergy", smoker: "Smoker", familyHistory: "Family hx", bp: "BP", hr: "HR",
}

describe("preop section overview", () => {
  it("marks required sections ready when their clinical gates are satisfied", () => {
    const items = buildPreopSectionItems({
      // An adult age, because this record carries no clinical mode and so reads
      // as adult. Fourteen is a paediatric age, which the shared readiness rule
      // refuses in an adult record -- that is the rule working, not a quirk of
      // the fixture.
      ageYears: 41,
      sex: "MALE",
      heightCm: 160,
      weightKg: 50,
      diagnoses: [{ label: "Appendicitis", code: "K35" }],
      procedures: [{ label: "Appendectomy", code: "47" }],
      bpSystolic: 120,
      bpDiastolic: 70,
      heartRate: 80,
      spO2: 99,
      respiratoryRate: 15,
      mallampati: "II",
      asaScore: "II",
    }, labels, text)

    expect(items.filter((item) => item.required).map((item) => [item.key, item.done])).toEqual([
      ["patient", true],
      ["case", true],
      ["exam", true],
      ["airway", true],
      ["risk", true],
    ])
    expect(items.find((item) => item.key === "case")?.summary).toBe("Appendectomy")
  })

  it("accepts unobtainable exam and airway values as completed gates", () => {
    const items = buildPreopSectionItems({
      bpUnobtainable: true,
      heartRateUnobtainable: true,
      respiratoryRateUnobtainable: true,
      airwayUnobtainable: true,
    }, labels, text)

    expect(items.find((item) => item.key === "exam")?.done).toBe(true)
    expect(items.find((item) => item.key === "airway")?.done).toBe(true)
  })
})

describe("preop section overview wording (2026-10-18)", () => {
  it("names the sex and counts in the reader's words, never the stored code", () => {
    const bg = { ...text, age: "{age} г.", sexFemale: "Ж", comorbidityCount: "Придружаващи заболявания: {count}", allergy: "Алергия", smoker: "Пушач" }
    const items = buildPreopSectionItems({
      ageYears: 67, sex: "FEMALE", weightKg: 88, allergies: true, smoking: true,
      comorbidities: [{ label: "I10" }, { label: "E11" }],
    } as never, labels, bg)
    const summary = (key: string) => items.find(item => item.key === key)?.summary
    expect(summary("patient")).toBe("67 г. · Ж · 88 kg")
    expect(summary("history")).toBe("Придружаващи заболявания: 2")
    expect(summary("anamnesis")).toBe("Алергия · Пушач")
  })
})
