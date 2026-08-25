import { describe, expect, it } from "vitest"
import { clinicalRuleUiCopy } from "./ui-copy"

describe("clinical-rule editor interface copy", () => {
  it("localizes editor chrome without surfacing untranslated validation detail", () => {
    const copy = clinicalRuleUiCopy("bg")

    expect(copy.saveRule).toBe("Запази правилото")
    expect(copy.maximumAgeExclusive).toContain("без горната граница")
    expect(copy.bandIssue(2, "canonical detail")).toBe("Група 2: проверете въведените стойности.")
  })

  it("uses English outside Bulgarian locales", () => {
    expect(clinicalRuleUiCopy("en").selectDrug).toBe("Select drug")
    expect(clinicalRuleUiCopy("fr").duplicateBand).toBe("Duplicate band")
  })
})
