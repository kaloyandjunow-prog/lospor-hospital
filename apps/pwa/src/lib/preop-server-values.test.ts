import { describe, expect, it } from "vitest"
import { commaToTags, diagToTags, valuesFromServerPreop } from "./preop-server-values"

describe("preop server values", () => {
  // Reopening a case must never answer a clinical question on the user's
  // behalf. The old default silently pre-selected MALE, so a case could be
  // finalised asserting a sex nobody had recorded.
  describe("sex is never invented when reopening a case", () => {
    it("leaves the control unselected when the server has no sex", () => {
      expect(valuesFromServerPreop({}).sex).toBeUndefined()
    })

    it("treats the server's UNKNOWN as unselected, not as a value", () => {
      expect(valuesFromServerPreop({ sex: "UNKNOWN" }).sex).toBeUndefined()
    })

    it("restores a sex that really was recorded", () => {
      expect(valuesFromServerPreop({ sex: "FEMALE" }).sex).toBe("FEMALE")
      expect(valuesFromServerPreop({ sex: "OTHER" }).sex).toBe("OTHER")
    })
  })

  it("parses comma separated medication tags and JSON arrays", () => {
    expect(commaToTags("Aspirin, Metformin")).toEqual([
      { label: "Aspirin" },
      { label: "Metformin" },
    ])
    expect(commaToTags('[{"label":"Propofol","atcCode":"N01AX10"}]')).toEqual([
      { label: "Propofol", atcCode: "N01AX10" },
    ])
  })

  it("keeps diagnoses split on semicolons instead of commas", () => {
    expect(diagToTags("Benign tumor, appendix; Acute appendicitis")).toEqual([
      { label: "Benign tumor, appendix" },
      { label: "Acute appendicitis" },
    ])
  })

  it("maps server aliases into form defaults", () => {
    const values = valuesFromServerPreop({
      diagnosis: "Appendicitis",
      plannedProcedure: "Appendectomy",
      comorbidities: "Asthma; Diabetes",
      currentMedications: "Salbutamol",
      ulbt: "II",
      difficultAirway: true,
      notes: "team note",
    })

    expect(values.diagnoses).toEqual([{ label: "Appendicitis" }])
    expect(values.procedures).toEqual([{ label: "Appendectomy" }])
    expect(values.comorbidities).toEqual([{ label: "Asthma" }, { label: "Diabetes" }])
    expect(values.currentMedications).toEqual([{ label: "Salbutamol" }])
    expect(values.upperLipBiteTest).toBe("CLASS_II")
    expect(values.difficultAirwayHistory).toBe(true)
    expect(values.teamNotes).toBe("team note")
  })
})
