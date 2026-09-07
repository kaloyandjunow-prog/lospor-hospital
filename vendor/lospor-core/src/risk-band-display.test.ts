import { describe, expect, it } from "vitest"
import {
  displayApfelRisk,
  displayRcriRisk,
  displayStopBangRisk,
} from "./risk-band-display"
import {
  APFEL_BAND_KEYS,
  RCRI_BAND_KEYS,
  STOP_BANG_BAND_KEYS,
  apfelRiskBand,
  rcriRiskBand,
  stopBangRiskBand,
} from "./risk"

describe("showing a clinician what a risk score means", () => {
  it("names the band and the incidence behind it", () => {
    expect(displayRcriRisk(0, "en").label).toBe("Very low (0.4%)")
    expect(displayRcriRisk(3, "en").label).toBe("High (≥ 5.4%)")
    expect(displayApfelRisk(2, "en").label).toBe("Moderate (~ 40%)")
  })

  /**
   * The web summary rendered a finished English string whatever language the
   * clinician had chosen, because the words were baked into the function that
   * classified the score. They are vocabulary now, like every other clinical
   * word in the product.
   */
  it("says the same thing in Bulgarian", () => {
    expect(displayRcriRisk(0, "bg").label).toBe("Много нисък (0.4%)")
    expect(displayRcriRisk(3, "bg").band).toBe("Висок")
    expect(displayApfelRisk(0, "bg").band).toBe("Нисък")
  })

  /**
   * A STOP-BANG band is a likelihood of obstructive sleep apnoea, not a
   * published event rate. "Low" on its own would not say what is low, and a
   * percentage invented to fill the field would be worse.
   */
  it("names what is low for STOP-BANG, and quotes no rate", () => {
    const shown = displayStopBangRisk(1, "en")
    expect(shown.label).toBe("Low OSA risk")
    expect(shown.incidence).toBeUndefined()
    expect(displayStopBangRisk(3, "bg").label).toBe("Междинен риск от ОСА")
  })

  it("carries the severity through for the colour a client gives it", () => {
    expect(displayRcriRisk(0, "en").severity).toBe("low")
    expect(displayRcriRisk(2, "en").severity).toBe("mid")
    expect(displayStopBangRisk(8, "en").severity).toBe("high")
  })

  // Every band a score can reach has to resolve to a real word. An unknown
  // code renders as the code itself, which would print "very_low" at a bedside.
  it.each([
    ["RCRI", RCRI_BAND_KEYS, (score: number) => displayRcriRisk(score, "en"), [0, 1, 2, 3, 6]],
    ["Apfel", APFEL_BAND_KEYS, (score: number) => displayApfelRisk(score, "en"), [0, 1, 2, 3, 4]],
    ["STOP-BANG", STOP_BANG_BAND_KEYS, (score: number) => displayStopBangRisk(score, "en"), [0, 2, 3, 4, 5, 8]],
  ])("has a word for every %s band", (_name, _keys, show, scores) => {
    for (const score of scores as number[]) {
      const shown = show(score)
      expect(shown.band).not.toMatch(/_/)
      expect(shown.band.length).toBeGreaterThan(0)
    }
  })

  it("keeps the band list and the band functions in step", () => {
    for (let score = 0; score <= 6; score += 1) {
      expect(RCRI_BAND_KEYS).toContain(rcriRiskBand(score).key)
    }
    for (let score = 0; score <= 4; score += 1) {
      expect(APFEL_BAND_KEYS).toContain(apfelRiskBand(score).key)
    }
    for (let score = 0; score <= 8; score += 1) {
      expect(STOP_BANG_BAND_KEYS).toContain(stopBangRiskBand(score).key)
    }
  })
})
