export type CodedTag = { code?: string; sub?: string; label?: string }
export type CodedMed = { inn?: string; atcCode?: string; label?: string }
export type LabEntry = { test: string; value?: string; unit?: string }

export type RiskBandKey =
  | "very_low"
  | "low"
  | "moderate"
  | "intermediate"
  | "high"

export type RiskSeverity = "low" | "mid" | "high"

/**
 * A score's risk band: which band, how severe, and the incidence the score was
 * validated against.
 *
 * `key` is a translation key, never a word. There used to be a second set of
 * functions returning finished English strings -- "Very low (0.4%)" -- and one
 * client rendered those while the other rendered the band, so the same RCRI
 * showed a percentage in English on the web and a translated band with no
 * percentage on the phone. The band is the classification and the incidence is
 * clinical data; neither is a sentence, and both belong here.
 *
 * `incidence` is absent where the score does not carry one. STOP-BANG bands
 * express a likelihood of obstructive sleep apnoea rather than a published
 * event rate, and inventing a figure to fill the field would be worse than
 * leaving it out.
 */
export type RiskBand = {
  key: RiskBandKey
  severity: RiskSeverity
  incidence?: string
}

/**
 * The bands each score can produce, so a client's copy table can be checked
 * against them. RCRI has no "intermediate" and STOP-BANG has no "very low";
 * one table over every key would make a client invent copy for bands that
 * cannot occur, which is how a wrong label gets written and never seen.
 */
export const RCRI_BAND_KEYS = ["very_low", "low", "moderate", "high"] as const
export const APFEL_BAND_KEYS = ["low", "moderate", "high"] as const
export const STOP_BANG_BAND_KEYS = ["low", "intermediate", "high"] as const

export type RcriBandKey = typeof RCRI_BAND_KEYS[number]
export type ApfelBandKey = typeof APFEL_BAND_KEYS[number]
export type StopBangBandKey = typeof STOP_BANG_BAND_KEYS[number]

/** Revised Cardiac Risk Index — major adverse cardiac event rate. */
export function rcriRiskBand(score: number): RiskBand & { key: RcriBandKey } {
  if (score === 0) return { key: "very_low", severity: "low", incidence: "0.4%" }
  if (score === 1) return { key: "low", severity: "low", incidence: "1.0%" }
  if (score === 2) return { key: "moderate", severity: "mid", incidence: "2.4%" }
  return { key: "high", severity: "high", incidence: "≥ 5.4%" }
}

/**
 * Apfel — postoperative nausea and vomiting rate, per the Fifth Consensus
 * Guidelines (Gan 2025): about 10/20/40/60/80% for 0-4 factors, and 0 = low,
 * 1-2 = medium, 3+ = high. One factor used to read "low, < 10%", which put a
 * non-smoking woman with no other factor at half her published risk.
 */
const APFEL_INCIDENCE = ["~ 10%", "~ 20%", "~ 40%", "~ 60%", "~ 80%"] as const

export function apfelRiskBand(score: number): RiskBand & { key: ApfelBandKey } {
  const incidence = APFEL_INCIDENCE[Math.min(Math.max(Math.trunc(score), 0), 4)]
  if (score <= 0) return { key: "low", severity: "low", incidence }
  if (score <= 2) return { key: "moderate", severity: "mid", incidence }
  return { key: "high", severity: "high", incidence }
}

/**
 * PAED (Pediatric Anesthesia Emergence Delirium, 0-20). Sikich & Lerman 2004
 * used >= 10; later work found > 12 more specific. 10-12 is therefore
 * "possible" and above 12 "likely" -- a band for reading, not a diagnosis.
 */
export const PAED_BAND_KEYS = ["paed_none", "paed_possible", "paed_likely"] as const
export type PaedBandKey = typeof PAED_BAND_KEYS[number]

export function paedRiskBand(score: number): { key: PaedBandKey; severity: RiskSeverity } {
  if (score < 10) return { key: "paed_none", severity: "low" }
  if (score <= 12) return { key: "paed_possible", severity: "mid" }
  return { key: "paed_likely", severity: "high" }
}

/** STOP-BANG — likelihood of obstructive sleep apnoea, not an event rate. */
export function stopBangRiskBand(score: number): RiskBand & { key: StopBangBandKey } {
  if (score <= 2) return { key: "low", severity: "low" }
  if (score <= 4) return { key: "intermediate", severity: "mid" }
  return { key: "high", severity: "high" }
}

function codesOf(tags: CodedTag[]): string[] {
  return tags.map(t => (t.code ?? t.sub ?? "").toUpperCase()).filter(Boolean)
}

function hasCodePrefix(tags: CodedTag[], prefixes: string[]): boolean {
  const codes = codesOf(tags)
  return prefixes.some(prefix => codes.some(code => code.startsWith(prefix)))
}

function hasAtcPrefix(meds: CodedMed[], prefixes: string[]): boolean {
  const codes = meds.map(m => (m.atcCode ?? "").toUpperCase()).filter(Boolean)
  return prefixes.some(prefix => codes.some(code => code.startsWith(prefix)))
}

export function suggestRcriIschemicHeart(comorbidities: CodedTag[]): boolean {
  return hasCodePrefix(comorbidities, ["I21", "I25"])
}

export function suggestRcriCHF(comorbidities: CodedTag[]): boolean {
  return hasCodePrefix(comorbidities, ["I50"])
}

export function suggestRcriCVD(comorbidities: CodedTag[]): boolean {
  return hasCodePrefix(comorbidities, ["I63", "I64", "G45"])
}

export function suggestRcriInsulinDM(comorbidities: CodedTag[], medications: CodedMed[]): boolean {
  return hasCodePrefix(comorbidities, ["E10"]) || hasAtcPrefix(medications, ["A10A"])
}

export function suggestRcriCreatinine(labResults: LabEntry[]): boolean {
  const entry = labResults.find(lab => lab.test === "Creatinine")
  if (!entry?.value) return false
  const value = parseFloat(entry.value)
  if (!Number.isFinite(value)) return false
  if (entry.unit === "mg/dL") return value > 2.0
  return value > 177
}

export function suggestStopBangBP(comorbidities: CodedTag[], medications: CodedMed[]): boolean {
  return hasCodePrefix(comorbidities, ["I10", "I11"]) || hasAtcPrefix(medications, ["C02", "C03", "C07", "C08", "C09"])
}

/** A warning from the current medications; `labelBg` for a Bulgarian reader (2026-10-18). */
export type MedicationWarning = { key: string; label: string; labelBg: string }

export function getMedicationWarnings(medications: CodedMed[]): MedicationWarning[] {
  const warnings: MedicationWarning[] = []
  if (hasAtcPrefix(medications, ["B01A"])) {
    warnings.push({ key: "anticoagulant", label: "Anticoagulant/antiplatelet \u2014 review neuraxial/regional bleeding risk", labelBg: "Антикоагулант/антиагрегант — преценете риска от кървене при невраксиална/регионална анестезия" })
  }
  if (hasAtcPrefix(medications, ["H02"])) {
    warnings.push({ key: "steroid", label: "Chronic steroid use \u2014 consider perioperative steroid coverage", labelBg: "Продължителна кортикостероидна терапия — обмислете периоперативно стероидно покритие" })
  }
  if (hasAtcPrefix(medications, ["C07"])) {
    warnings.push({ key: "betablocker", label: "Beta-blocker \u2014 continue perioperatively per protocol", labelBg: "Бета-блокер — продължете периоперативно според протокола" })
  }
  return warnings
}

export type AirwayFindings = {
  mallampati?: string | null
  neckMobility?: string | null
  mouthOpeningCm?: number | null
  cormackLehane?: string | null
}

export function suggestsDifficultAirwayEquipment(findings: AirwayFindings): boolean {
  if (findings.mallampati === "III" || findings.mallampati === "IV") return true
  if (findings.neckMobility === "FIXED") return true
  if (findings.mouthOpeningCm != null && findings.mouthOpeningCm < 3) return true
  if (findings.cormackLehane && ["IIb", "III", "IV"].includes(findings.cormackLehane)) return true
  return false
}
