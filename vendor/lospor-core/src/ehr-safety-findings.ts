/**
 * What this anaesthetic learned that the patient's next one needs to know.
 *
 * Its own message, sent separately from the protocol, because this is the part
 * that changes what happens to the patient at a future admission. Inside a PDF
 * nobody opens until then, it is wasted — and the whole reason to send anything
 * back to a hospital system is that the next team reads the hospital record,
 * not ours.
 *
 * Two findings, treated deliberately differently.
 */

import type { CormackLehane, MallampatiClass } from "./case-detail"

/**
 * Grades III and IV are the ones worth warning about: no view of the glottis,
 * or none of the larynx at all. IIa and IIb are a partial view and a routine
 * intubation, so sending them would train people to ignore the message.
 */
const DIFFICULT_VIEW: ReadonlySet<CormackLehane> = new Set(["III", "IV"])
const PREDICTS_DIFFICULTY: ReadonlySet<MallampatiClass> = new Set(["III", "IV"])

export type EhrAirwayFinding = {
  kind: "airway"
  /** The grade actually seen at laryngoscopy in this case. */
  grade: CormackLehane
  /**
   * Whether anything in the preoperative assessment pointed at this.
   *
   * The timing *is* the information here, which is why this finding carries it
   * and the allergy one does not. "Predicted difficult and was" confirms an
   * assessment that already works. "Looked straightforward and was not" is the
   * dangerous one: nobody will predict it next time either, unless this message
   * tells them. They are different warnings and must not be flattened into one.
   */
  anticipated: boolean
  /** What in the preoperative assessment pointed at it, when anything did. */
  predictors: string[]
}

export type EhrAllergyFinding = {
  kind: "allergy"
  /**
   * The whole list, not a delta.
   *
   * No "discovered during this case" flag exists and none is wanted: an allergy
   * is a standing contraindication whenever it was learned, so the timing
   * changes nothing about what a future team should avoid. The hospital
   * deduplicates against what it already holds. That asymmetry with the airway
   * finding is deliberate — an allergy reported twice costs a drug choice, one
   * omitted can kill.
   */
  items: { label: string; source?: string }[]
}

export type EhrSafetyFinding = EhrAirwayFinding | EhrAllergyFinding

type PreopLike = {
  mallampati?: MallampatiClass | null
  cormackLehane?: CormackLehane | null
  difficultAirwayHistory?: boolean | null
  neckMobility?: string | null
  mouthOpeningCm?: number | null
  thyromental?: number | null
  allergies?: boolean | null
  allergyDetails?: unknown
}

type IntraopLike = {
  cormackLehane?: CormackLehane | null
}

/**
 * Below these, an airway is harder to manage and every airway text says so.
 * Named constants rather than inline numbers because they are clinical
 * thresholds, not tuning.
 */
const LIMITED_MOUTH_OPENING_CM = 3
const SHORT_THYROMENTAL_CM = 6.5

function airwayPredictors(preop: PreopLike): string[] {
  const predictors: string[] = []
  if (preop.mallampati && PREDICTS_DIFFICULTY.has(preop.mallampati)) {
    predictors.push(`Mallampati ${preop.mallampati}`)
  }
  if (preop.difficultAirwayHistory === true) {
    predictors.push("previous difficult airway")
  }
  // A grade recorded preoperatively comes from an earlier anaesthetic, so it is
  // history rather than an examination finding — but it predicts just as well.
  if (preop.cormackLehane && DIFFICULT_VIEW.has(preop.cormackLehane)) {
    predictors.push(`previous Cormack-Lehane ${preop.cormackLehane}`)
  }
  if (preop.neckMobility === "LIMITED" || preop.neckMobility === "FIXED") {
    predictors.push(`neck mobility ${preop.neckMobility.toLowerCase()}`)
  }
  if (typeof preop.mouthOpeningCm === "number" && preop.mouthOpeningCm < LIMITED_MOUTH_OPENING_CM) {
    predictors.push(`mouth opening ${preop.mouthOpeningCm} cm`)
  }
  if (typeof preop.thyromental === "number" && preop.thyromental < SHORT_THYROMENTAL_CM) {
    predictors.push(`thyromental ${preop.thyromental} cm`)
  }
  return predictors
}

/**
 * Parse whatever the allergy field holds.
 *
 * It is stored as a string, but a tagged list is serialised into it as JSON, so
 * both shapes arrive. A plain string is one free-text entry rather than an
 * error — a hospital that gets "penicillin" as text should still be told.
 */
function allergyItems(raw: unknown): { label: string; source?: string }[] {
  if (Array.isArray(raw)) {
    return raw.flatMap(item => {
      if (!item || typeof item !== "object") {
        const label = String(item ?? "").trim()
        return label ? [{ label }] : []
      }
      const record = item as Record<string, unknown>
      const label = String(record.label ?? record.inn ?? record.atcCode ?? "").trim()
      if (!label) return []
      const source = typeof record.source === "string" ? record.source : undefined
      return [source ? { label, source } : { label }]
    })
  }
  if (typeof raw !== "string") return []
  const text = raw.trim()
  if (!text) return []
  if (text.startsWith("[")) {
    try {
      return allergyItems(JSON.parse(text))
    } catch {
      // Unparseable JSON is still somebody's clinical text. Send it as written
      // rather than dropping an allergy because its encoding was wrong.
      return [{ label: text }]
    }
  }
  return [{ label: text }]
}

/**
 * Everything from this case that should reach the patient's next anaesthetist.
 *
 * Returns an empty list when there is nothing to warn about, which is the
 * common case — a message is only worth sending when it says something.
 */
export function buildSafetyFindings(input: {
  preop?: PreopLike | null
  intraop?: IntraopLike | null
}): EhrSafetyFinding[] {
  const findings: EhrSafetyFinding[] = []
  const preop = input.preop ?? {}
  const grade = input.intraop?.cormackLehane ?? null

  if (grade && DIFFICULT_VIEW.has(grade)) {
    const predictors = airwayPredictors(preop)
    findings.push({
      kind: "airway",
      grade,
      anticipated: predictors.length > 0,
      predictors,
    })
  }

  // Sent whenever the patient has any, not only when this case discovered them.
  // See EhrAllergyFinding.items for why the asymmetry with the airway is right.
  const items = preop.allergies === false ? [] : allergyItems(preop.allergyDetails)
  if (items.length > 0) findings.push({ kind: "allergy", items })

  return findings
}

/**
 * Is this message worth sending at all?
 *
 * Sending an empty safety message on every finalised case is how a hospital
 * learns to filter the channel out, and then the one that matters is filtered
 * too.
 */
export function hasSafetyFindings(findings: EhrSafetyFinding[]): boolean {
  return findings.length > 0
}
