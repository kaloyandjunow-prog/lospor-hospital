import { describe, expect, it } from "vitest"
import { caseMetaParts, formatCaseMonth } from "./case-meta"

describe("the case header line", () => {
  it("writes the month as the web case page does", () => {
    expect(formatCaseMonth("2026-10", "en")).toBe("Oct 2026")
    expect(formatCaseMonth("bad", "en")).toBe("bad")
  })

  it("lists age, sex, ASA and month", () => {
    const tc = (key: string) => ({ yearsShort: "y", sexMaleShort: "M", sexFemaleShort: "F" } as Record<string, string>)[key] ?? key
    expect(caseMetaParts({ preop: { ageYears: 3, sex: "MALE", asaScore: "I" }, intraop: { monthYear: "2026-10" } }, tc, "en"))
      .toEqual(["3 y", "M", "ASA I", "Oct 2026"])
  })
})
