import { describe, expect, it } from "vitest"
import type { LibraryOption } from "@lospor/core/option-library"
import { clinicalEventName } from "./clinical-event-name"

const options = [{ value: "HYPOTENSION", label: "Hypotension", labelBg: "Хипотония" }] as LibraryOption[]
const fixed = { "Anaesthesia start": "Начало на анестезията" }

// Found testing Hospital 1.5.0: Bulgarian timetables showed some events in English.
describe("a clinical event's name", () => {
  it("is the catalogue's Bulgarian name", () => {
    expect(clinicalEventName("Hypotension", options, "bg", fixed)).toBe("Хипотония")
  })
  it("keeps a typed detail after the translated name", () => {
    expect(clinicalEventName("Hypotension (treated)", options, "bg", fixed)).toBe("Хипотония (treated)")
  })
  it("translates the label the PWA writes when a case starts", () => {
    expect(clinicalEventName("Anaesthesia start", options, "bg", fixed)).toBe("Начало на анестезията")
  })
  it("leaves free text as typed", () => {
    expect(clinicalEventName("Patient repositioned", options, "bg", fixed)).toBe("Patient repositioned")
  })
})
