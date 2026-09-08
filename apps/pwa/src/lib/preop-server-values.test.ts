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

  /**
   * The new-case form already refuses to pre-answer ASA, elective/emergency
   * and difficult-airway history, specifically because guessing biased the
   * register toward healthy elective adult males. Reopening an existing case
   * used to reintroduce every one of those guesses -- the same bug, fixed
   * once and left in place a second time.
   */
  describe("reopening a case never invents an answer it fixed for new cases", () => {
    it("leaves ASA unset rather than defaulting to class I", () => {
      expect(valuesFromServerPreop({}).asaScore).toBeUndefined()
    })

    it("restores an ASA that really was recorded", () => {
      expect(valuesFromServerPreop({ asaScore: "III" }).asaScore).toBe("III")
    })

    it("leaves elective unanswered rather than deriving it from emergencySurgery", () => {
      expect(valuesFromServerPreop({ emergencySurgery: false }).elective).toBe(false)
      expect(valuesFromServerPreop({}).elective).toBe(false)
    })

    it("leaves difficult-airway history unknown rather than recording a false negative", () => {
      expect(valuesFromServerPreop({}).difficultAirwayHistory).toBeNull()
    })

    it("still reads the legacy difficultAirway column when the canonical one is absent", () => {
      expect(valuesFromServerPreop({ difficultAirway: true }).difficultAirwayHistory).toBe(true)
    })

    it("does not copy the general notes field into teamNotes", () => {
      expect(valuesFromServerPreop({ notes: "a general note" }).teamNotes).toBeUndefined()
      expect(valuesFromServerPreop({ notes: "a general note" }).notes).toBe("a general note")
    })

    it("keeps a teamNotes that really was recorded, separate from notes", () => {
      const values = valuesFromServerPreop({ teamNotes: "team note", notes: "general note" })
      expect(values.teamNotes).toBe("team note")
      expect(values.notes).toBe("general note")
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

  /**
   * `??` does not fall through on an empty array, so a structured field that
   * exists but is empty used to hide legacy text that was still the real
   * answer. Preferring structured data only once it actually holds something
   * is the same rule web's mapper already applies.
   */
  describe("an empty structured field falls back to legacy text", () => {
    it("uses the legacy diagnosis text when diagnosesJson is empty", () => {
      expect(valuesFromServerPreop({ diagnosesJson: [], diagnosis: "Appendicitis" }).diagnoses)
        .toEqual([{ label: "Appendicitis" }])
    })

    it("prefers a non-empty structured diagnoses array over legacy text", () => {
      expect(valuesFromServerPreop({
        diagnosesJson: [{ label: "Structured" }],
        diagnosis: "Legacy text",
      }).diagnoses).toEqual([{ label: "Structured" }])
    })

    it("applies the same rule to procedures", () => {
      expect(valuesFromServerPreop({ proceduresJson: [], plannedProcedure: "Appendectomy" }).procedures)
        .toEqual([{ label: "Appendectomy" }])
    })
  })

  it("maps server aliases into form defaults", () => {
    const values = valuesFromServerPreop({
      diagnosis: "Appendicitis",
      plannedProcedure: "Appendectomy",
      comorbidities: "Asthma; Diabetes",
      currentMedications: "Salbutamol",
      ulbt: "II",
      difficultAirway: true,
    })

    expect(values.diagnoses).toEqual([{ label: "Appendicitis" }])
    expect(values.procedures).toEqual([{ label: "Appendectomy" }])
    expect(values.comorbidities).toEqual([{ label: "Asthma" }, { label: "Diabetes" }])
    expect(values.currentMedications).toEqual([{ label: "Salbutamol" }])
    expect(values.upperLipBiteTest).toBe("CLASS_II")
    expect(values.difficultAirwayHistory).toBe(true)
  })
})
