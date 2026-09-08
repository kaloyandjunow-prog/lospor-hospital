import {
  apfelRiskBand,
  rcriRiskBand,
  stopBangRiskBand,
  type RiskBand,
  type RiskSeverity,
} from "./risk"
import { resolveClinicalDisplay } from "./display"
import type { ClinicalLocale } from "./display"

/**
 * A risk score rendered for a clinician: the band in their language, with the
 * incidence the score was validated against.
 *
 * The words are terms in the shared clinical vocabulary, so they are resolved
 * the same way every other clinical word in the product is, and neither client
 * keeps its own copy of them. Both apps used to: one rendered a finished
 * English string with the percentage baked in, whatever language the clinician
 * had chosen, and the other a translated band with no percentage. The same
 * RCRI therefore read differently depending on which screen you opened.
 *
 * STOP-BANG has its own words because its bands describe a likelihood of
 * obstructive sleep apnoea rather than a rate of events, and "Low" alone would
 * not say what is low.
 */

const BAND_CODE: Readonly<Record<string, string>> = {
  very_low: "very_low",
  low: "low",
  moderate: "moderate",
  high: "high",
}

const OSA_BAND_CODE: Readonly<Record<string, string>> = {
  low: "osa_low",
  intermediate: "osa_intermediate",
  high: "osa_high",
}

export type DisplayedRiskBand = {
  /** Band and incidence together, ready to print. */
  label: string
  /** The band alone, for a caller that lays the incidence out separately. */
  band: string
  incidence?: string
  severity: RiskSeverity
}

function display(
  scored: RiskBand,
  codes: Readonly<Record<string, string>>,
  locale: ClinicalLocale,
): DisplayedRiskBand {
  const band = resolveClinicalDisplay("riskBand", codes[scored.key] ?? scored.key, locale).label
  return {
    label: scored.incidence ? `${band} (${scored.incidence})` : band,
    band,
    ...(scored.incidence ? { incidence: scored.incidence } : {}),
    severity: scored.severity,
  }
}

export function displayRcriRisk(score: number, locale: ClinicalLocale): DisplayedRiskBand {
  return display(rcriRiskBand(score), BAND_CODE, locale)
}

export function displayApfelRisk(score: number, locale: ClinicalLocale): DisplayedRiskBand {
  return display(apfelRiskBand(score), BAND_CODE, locale)
}

export function displayStopBangRisk(score: number, locale: ClinicalLocale): DisplayedRiskBand {
  return display(stopBangRiskBand(score), OSA_BAND_CODE, locale)
}
