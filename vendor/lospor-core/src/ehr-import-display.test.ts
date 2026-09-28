import { describe, expect, it } from "vitest"

import { describeEhrReviewItem, ehrScalarText, ehrTakenDateText } from "./ehr-import-display"
import type { EhrReviewItem } from "./ehr-import-review"

// The import review as the 1.4.13 appliance showed it for test patient 70044:
// labels in Bulgarian, values still the hospital's codes.

const item = (field: EhrReviewItem["field"], proposed: unknown): EhrReviewItem =>
  ({ field, itemKey: field, state: "preselected", proposed }) as EhrReviewItem
const bg = { locale: "bg" as const, undatedLabel: "Без дата", takenLabel: "Взета", timeZone: "Europe/Sofia" }
const en = { locale: "en" as const, undatedLabel: "Undated", takenLabel: "Taken", timeZone: "Europe/Sofia" }

describe("the import review says values in the clinician's language", () => {
  it("translates sex, age unit and yes/no answers", () => {
    expect(describeEhrReviewItem(item("sex", "MALE"), bg).title).toBe("Мъж")
    expect(describeEhrReviewItem(item("sex", "FEMALE"), en).title).toBe("Female")
    expect(describeEhrReviewItem(item("ageUnit", "YEARS"), bg).title).toBe("Години")
    expect(describeEhrReviewItem(item("ageUnit", "MONTHS"), en).title).toBe("Months")
    expect(describeEhrReviewItem(item("allergies", true), bg).title).toBe("Да")
    expect(describeEhrReviewItem(item("latexAllergy", false), bg).title).toBe("Не")
    expect(describeEhrReviewItem(item("allergies", false), en).title).toBe("No")
  })

  it("writes group O as 0 in Bulgarian and names the Rh factor", () => {
    expect(ehrScalarText("bloodType", "O", "bg")).toBe("0")
    expect(ehrScalarText("bloodType", "O", "en")).toBe("O")
    expect(ehrScalarText("bloodType", "AB", "bg")).toBe("AB")
    expect(ehrScalarText("rhFactor", "NEGATIVE", "bg")).toBe("Отрицателен")
    expect(ehrScalarText("rhFactor", "POSITIVE", "en")).toBe("Positive")
  })

  it("leaves numbers, and codes it does not know, as sent; says a null as a dash", () => {
    expect(describeEhrReviewItem(item("bpSystolic", 125), bg).title).toBe("125")
    expect(ehrScalarText("sex", "X-UNLISTED", "bg")).toBe("X-UNLISTED")
    expect(describeEhrReviewItem(item("allergies", null), bg).title).toBe("—")
  })

  it("names a medication's route, keeping one it does not know", () => {
    const ramipril = { label: "Ramipril", dose: "1 tablet", route: "TOPICAL", frequency: "once daily" }
    expect(describeEhrReviewItem(item("currentMedications", ramipril), bg).detail).toBe("1 tablet · Локално · once daily")
    expect(describeEhrReviewItem(item("currentMedications", { ...ramipril, route: "oral" }), en).detail).toBe("1 tablet · Oral · once daily")
    expect(describeEhrReviewItem(item("currentMedications", { ...ramipril, route: "per stoma" }), bg).detail).toBe("1 tablet · per stoma · once daily")
  })

  it("dates a result by its day where it was taken, not by its UTC day", () => {
    // 01:30 in Sofia on 23 September is 22:30 UTC on the 22nd.
    const lab = { test: "Haemoglobin (Hb)", value: 133, unit: "g/L", takenAt: "2026-09-22T22:30:00.000Z" }
    expect(describeEhrReviewItem(item("labResults", lab), bg)).toEqual({ title: "Haemoglobin (Hb) 133 g/L", detail: "Взета 23.09.2026" })
    expect(describeEhrReviewItem(item("labResults", lab), en).detail).toBe("Taken 23 Sep 2026")
    expect(ehrTakenDateText(lab.takenAt, "bg", "UTC")).toBe("22.09.2026")
    expect(describeEhrReviewItem(item("labResults", { ...lab, takenAt: null }), bg).detail).toBe("Без дата")
  })

  it("shows a diagnosis by its label with the hospital's code beneath", () => {
    const text = describeEhrReviewItem(item("diagnoses", { label: "Calculus of gallbladder without cholecystitis", code: "K80.2" }), bg)
    expect(text).toEqual({ title: "Calculus of gallbladder without cholecystitis", detail: "K80.2" })
  })
})
