import type { ClinicalLocale } from "./display"
import { POVOC_RISK_PERCENT } from "./pediatric"
import {
  displayApfelRisk,
  displayPaedBand,
  displayRcriRisk,
  displayStopBangRisk,
  type DisplayedRiskBand,
} from "./risk-band-display"

/**
 * The scores a research record carries, and the scale each is counted on.
 *
 * Every score is stored and exported as its raw count -- the number of risk
 * factors, or the sum of its points -- never as a fraction or a percentage.
 * The count is what a study pools, re-bands or recalibrates; a stored band
 * would freeze one guideline's cut-offs into the data. Apfel 1 read "Low
 * (< 10%)" until the 2025 PONV guideline put it at ~20%, and a stored label
 * would still say so on every finalised case.
 *
 * So the maximum and the band are added here, at display time: "3 / 4" and
 * the incidence the current guideline gives that count.
 */
export const RESEARCH_SCORE_SCALES = {
  /** Five criteria plus high-risk surgery. */
  rcri: { min: 0, max: 6 },
  apfel: { min: 0, max: 4 },
  stopBang: { min: 0, max: 8 },
  povoc: { min: 0, max: 4 },
  /** Five factors scored 1, 2 or 5, so the lowest possible total is 5. */
  colds: { min: 5, max: 25 },
  aldreteTotal: { min: 0, max: 10 },
  painScore: { min: 0, max: 10 },
  /** FLACC, FPS-R and NRS are all reported on 0-10 here. */
  pediatricPainScore: { min: 0, max: 10 },
  paedScore: { min: 0, max: 20 },
  /** Item-scored pain scales (10.0.0); FPS-R steps by 2. */
  flaccTotal: { min: 0, max: 10 },
  fpsrScore: { min: 0, max: 10 },
  nipsTotal: { min: 0, max: 7 },
  aldreteActivity: { min: 0, max: 2 },
  aldreteRespiration: { min: 0, max: 2 },
  aldreteCirculation: { min: 0, max: 2 },
  aldreteConsciousness: { min: 0, max: 2 },
  aldreteSpO2: { min: 0, max: 2 },
  /** A child's recovery score, in place of Aldrete (10.0.0). */
  stewardTotal: { min: 0, max: 6 },
  stewardConsciousness: { min: 0, max: 2 },
  stewardAirway: { min: 0, max: 2 },
  stewardMovement: { min: 0, max: 2 },
} as const

export type ResearchScoreField = keyof typeof RESEARCH_SCORE_SCALES

export function isResearchScoreField(field: string): field is ResearchScoreField {
  return Object.prototype.hasOwnProperty.call(RESEARCH_SCORE_SCALES, field)
}

const BANDED: Partial<Record<ResearchScoreField, (score: number, locale: ClinicalLocale) => DisplayedRiskBand>> = {
  rcri: displayRcriRisk,
  apfel: displayApfelRisk,
  stopBang: displayStopBangRisk,
  paedScore: displayPaedBand,
}

/**
 * A raw score as a researcher reads it: the count out of its maximum, then
 * the band or risk where the score has a published one. "3 / 4 · High
 * (~ 60%)", "2 / 4 · 30%", "17 / 25".
 */
export function displayResearchScore(field: ResearchScoreField, score: number, locale: ClinicalLocale): string {
  const raw = `${score} / ${RESEARCH_SCORE_SCALES[field].max}`
  const band = BANDED[field]
  if (band) return `${raw} · ${band(score, locale).label}`
  if (field === "povoc") {
    const percent = POVOC_RISK_PERCENT[score]
    return percent == null ? raw : `${raw} · ${percent}%`
  }
  return raw
}
