import { describe, expect, it } from "vitest"
import { derivePreopScores } from "./preop-payload"

describe("deriving preop risk scores from the recorded factors", () => {
  it("scores a complete adult record", () => {
    const scores = derivePreopScores({
      clinicalMode: "ADULT",
      sex: "FEMALE",
      heightCm: 165,
      weightKg: 70,
      smoking: false,
      apfelPONVHistory: true,
      apfelPostopOpioids: true,
      highRiskSurgery: true,
      rcriIschemicHeart: true,
    })
    // Apfel: female, non-smoker, PONV history, opioids planned -- all four.
    expect(scores.apfelScore).toBe(4)
    // RCRI: high-risk surgery and ischaemic heart disease -- two of six.
    expect(scores.rcriScore).toBe(2)
  })

  /**
   * The Apfel non-smoker factor is the negation of the question actually
   * asked, and `smoking` is tri-state. `!value` mapped an unanswered `null`
   * to `true`, so a smoking question nobody had answered yet silently
   * counted as a confirmed non-smoker -- a real point added to a real risk
   * score for a question with no answer.
   */
  describe("an unanswered smoking question never counts as a non-smoker", () => {
    it("does not award the non-smoker point when smoking is unanswered", () => {
      const unanswered = derivePreopScores({ clinicalMode: "ADULT", sex: "MALE", smoking: null })
      const neverAsked = derivePreopScores({ clinicalMode: "ADULT", sex: "MALE" })
      expect(unanswered.apfelScore).toBe(0)
      expect(neverAsked.apfelScore).toBe(0)
    })

    it("awards the point only when the patient is confirmed not to smoke", () => {
      expect(derivePreopScores({ clinicalMode: "ADULT", sex: "MALE", smoking: false }).apfelScore).toBe(1)
    })

    it("never awards the point to a confirmed smoker", () => {
      expect(derivePreopScores({ clinicalMode: "ADULT", sex: "MALE", smoking: true }).apfelScore).toBe(0)
    })
  })

  it("scores nothing pediatric -- adult scores do not apply", () => {
    const scores = derivePreopScores({ clinicalMode: "PEDIATRIC", sex: "FEMALE", smoking: false })
    expect(scores.rcriScore).toBeUndefined()
    expect(scores.apfelScore).toBeUndefined()
    expect(scores.stopBangScore).toBeUndefined()
  })

  it("still derives BMI and BSA for a pediatric record", () => {
    const scores = derivePreopScores({ clinicalMode: "PEDIATRIC", heightCm: 100, weightKg: 20 })
    expect(scores.bmi).toBe(20)
    expect(scores.bodySurfaceAreaM2).toBeGreaterThan(0)
  })

  it("scores a record with nothing answered as the lowest band, not an error", () => {
    const scores = derivePreopScores({ clinicalMode: "ADULT" })
    expect(scores.rcriScore).toBe(0)
    expect(scores.apfelScore).toBe(0)
    expect(scores.stopBangScore).toBe(0)
  })

  it("uses age and BMI in STOP-BANG once they are known", () => {
    const older = derivePreopScores({ clinicalMode: "ADULT", sex: "MALE", ageYears: 60 })
    const younger = derivePreopScores({ clinicalMode: "ADULT", sex: "MALE", ageYears: 30 })
    expect(older.stopBangScore).toBeGreaterThan(younger.stopBangScore!)
  })
})
