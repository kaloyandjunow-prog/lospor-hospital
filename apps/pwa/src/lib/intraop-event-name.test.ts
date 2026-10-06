import { describe, expect, it } from "vitest"
import { localizedClinicalEventText } from "./intraop-event-label"

const events = [{ label: "Intubation", labelBg: "Интубация" }]
const fixed = { "Anaesthesia start": "Начало на анестезията" }

// Found testing Hospital 1.5.0: an event added in Bulgarian showed an English pill.
describe("a clinical event's pill text", () => {
  it("is the name the picker showed", () => {
    expect(localizedClinicalEventText("Intubation", "bg", events, fixed)).toBe("Интубация")
  })
  it("falls back to Core's event catalogue", () => {
    expect(localizedClinicalEventText("Induction", "bg", events, fixed)).toBe("Увод")
  })
  it("translates the label the app writes when a case starts", () => {
    expect(localizedClinicalEventText("Anaesthesia start", "bg", events, fixed)).toBe("Начало на анестезията")
  })
  it("keeps a typed detail, and leaves English alone", () => {
    expect(localizedClinicalEventText("Intubation (difficult)", "bg", events, fixed)).toBe("Интубация (difficult)")
    expect(localizedClinicalEventText("Intubation", "en", events, fixed)).toBe("Intubation")
  })
})
