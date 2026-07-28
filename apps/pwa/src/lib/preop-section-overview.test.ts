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
}

describe("preop section overview", () => {
  it("marks required sections ready when their clinical gates are satisfied", () => {
    const items = buildPreopSectionItems({
      ageYears: 14,
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
