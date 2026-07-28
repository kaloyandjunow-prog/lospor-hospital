import { describe, expect, it } from "vitest"
import type { SummaryTimetableModel } from "@lospor/core/summary-timetable"
import { localizeSummaryTimetableModel, toClinicalLocale } from "./clinical-display"

describe("clinical display adapter", () => {
  it("normalizes application locales", () => {
    expect(toClinicalLocale("bg-BG")).toBe("bg")
    expect(toClinicalLocale("en-US")).toBe("en")
    expect(toClinicalLocale(undefined)).toBe("en")
  })

  it("localizes timetable text without changing canonical segment identity", () => {
    const model: SummaryTimetableModel = {
      nCols: 2,
      vitals: [],
      events: [{ col: 0, label: "Induction" }],
      drugTicks: [{ col: 0, name: "Propofol", n: 1 }],
      lanes: [
        {
          kind: "agent",
          label: "Agent",
          color: "#000000",
          segments: [{
            startCol: 0,
            endCol: 1,
            code: "SEVOFLURANE",
            text: "SEVOFLURANE 2%",
          }],
        },
        {
          kind: "position",
          label: "Position",
          color: "#000000",
          segments: [{
            startCol: 0,
            endCol: 1,
            code: "SUPINE",
            text: "SUPINE",
          }],
        },
        {
          kind: "gas",
          label: "Gas",
          color: "#000000",
          segments: [{
            startCol: 0,
            endCol: 1,
            code: "air",
            text: "O₂/Air · FGF 1 L/min",
          }],
        },
      ],
      hasData: true,
    }

    const localized = localizeSummaryTimetableModel(model, "en")

    expect(localized.events[0].label).toBe("Induction")
    expect(localized.drugTicks[0].name).toBe("Propofol")
    expect(localized.lanes[0].segments[0]).toEqual({
      startCol: 0,
      endCol: 1,
      code: "SEVOFLURANE",
      text: "Sevoflurane 2%",
    })
    expect(localized.lanes[1].segments[0].text).toBe("Supine")
    expect(localizeSummaryTimetableModel(model, "bg").lanes[2].segments[0].text)
      .toBe("O₂/Въздух · FGF 1 L/min")
    expect(model.lanes[0].segments[0].text).toBe("SEVOFLURANE 2%")
  })
})
