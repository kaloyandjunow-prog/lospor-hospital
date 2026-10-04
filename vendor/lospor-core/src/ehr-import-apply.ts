/**
 * Turn what the clinician ticked into an ordinary case edit.
 *
 * This is the only bridge between an import and the record, and it is
 * deliberately narrow. What comes out is a plain patch against canonical field
 * names — the same shape the clinician's own typing produces — so it travels
 * the ordinary case-edit route, hits the ordinary validation, and lands in the
 * ordinary audit trail as their edit. No import-specific write path exists,
 * which is why an import can never generate a conflict, and therefore why no
 * conflict UI is needed on the two clients that have none.
 *
 * Built once here rather than twice in the clients. The last time a
 * calculation lived separately in web and mobile the two drifted and a running
 * infusion read 0 mL on one of them; a review that accepted different things
 * depending on which screen you used would be the same failure with worse
 * consequences.
 *
 * The selection arriving from a client is not trusted. It is a list of keys,
 * and the server re-derives the plan and checks each one against it — a key
 * the plan does not offer is refused rather than applied.
 */

import type { EhrLabValue, EhrTagValue } from "./ehr-import"
import type { EhrReviewItem, EhrReviewPlan } from "./ehr-import-review"
import { isPediatricAge, normalizePediatricAge } from "./pediatric"
import type { ClinicalMode, PediatricAgeUnit } from "./pediatric"

export type EhrApplyRefusal = {
  itemKey: string
  reason:
    /** Not in this plan at all. */
    | "unknown"
    /** Refused on an earlier import; a refusal is not undone by ticking it. */
    | "declined"
    /** The case already says this; there is nothing to write. */
    | "unchanged"
    /**
     * A result in a unit we could not convert into ours.
     *
     * Refused rather than merely left unticked, which is where it differs from
     * an undated result: there the value is right and only its age is unknown,
     * so a clinician who can vouch for it may take it. Here the number is on
     * the laboratory's scale and our field is on ours, so writing it stores a
     * wrong figure — 8.9 is a normal haemoglobin in g/dL and a transfusion in
     * g/L. A clinician who wants the result types it in our unit, which is the
     * one act that cannot silently mean the wrong thing.
     */
    | "unconverted"
    /**
     * A test this product does not record.
     *
     * Accepting it would put a value in the case with nothing to read it
     * against and no concept to export it as. The hospital sent it and the
     * clinician is shown it; storing it is a different question, and the
     * answer is no.
     */
    | "unsupported-test"
    /**
     * An age that needs the other clinical mode on a deployment that cannot
     * switch to it (`allowModeChange: false`, no paediatric mode), or an item
     * from a pre-9.13.9 plan that was built in that state.
     *
     * Refused rather than written: an age in a mode that disagrees with it is
     * refused by the server anyway, and writing half of it is worse.
     */
    | "needs-mode-decision"
}

export type EhrApplyResult = {
  /**
   * A patch by canonical field name, exactly as the clinician's own edit.
   *
   * When `modeChange` is set, the age in it is already written for the new
   * mode, and it does not include `clinicalMode` itself.
   */
  patch: Record<string, unknown>
  /** Keys that were written, for recording what this import contributed. */
  appliedKeys: string[]
  refused: EhrApplyRefusal[]
  /**
   * The clinical mode the accepted age puts the case in, when it differs from
   * the mode the case is in now; otherwise null.
   *
   * **The client switches mode first, then writes `patch`.** The switch is the
   * client's own mode switch, with everything it always does: clearing the
   * vitals and risk scores of the old mode and normalising the age. Run after
   * the patch it would wipe the vitals this import just brought; run before,
   * the patch writes over the cleared fields and the case ends up holding
   * exactly what was accepted. Both land in one save, so the server never sees
   * a paediatric age in an adult case.
   */
  modeChange: ClinicalMode | null
}

const SELECTABLE: Record<EhrReviewItem["state"], EhrApplyRefusal["reason"] | null> = {
  preselected: null,
  // A deliberate reach past the default is allowed: the clinician has seen
  // their own value beside the proposal, or has opened the collapsed older
  // results, and chosen.
  conflict: null,
  superseded: null,
  // The clinician has read that no draw time came with it and taken it anyway.
  undated: null,
  unconverted: "unconverted",
  "unsupported-test": "unsupported-test",
  declined: "declined",
  unchanged: "unchanged",
  "needs-mode-decision": "needs-mode-decision",
}

function existingList(current: unknown): unknown[] {
  return Array.isArray(current) ? [...current] : []
}

const AGE_FIELDS = new Set(["ageYears", "ageValue", "ageUnit"])

function num(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Write an accepted age in the shape the case's current mode actually reads.
 *
 * The two modes keep age in different fields, and the server's `preciseAge`
 * reads *only* `ageValue`/`ageUnit` — `ageYears` is invisible to it. So an
 * accepted age written as `ageYears` into a paediatric case saves without
 * complaint and leaves the age field empty: accepted, stored, and not there.
 * A silent partial write is the worst outcome available here, because the
 * clinician has already ticked it and moved on.
 *
 * Adult mode is the mirror: it reads `ageYears`, so the paediatric pair is
 * cleared with explicit nulls rather than left behind to contradict it.
 * `undefined` would be dropped from the patch and the stale value would
 * survive — the same mistake that produced the pediatric-to-adult trap.
 */
function ageFor(
  mode: ClinicalMode,
  age: { value: number; unit: PediatricAgeUnit },
): Record<string, unknown> {
  const { value, unit } = age
  if (mode === "PEDIATRIC") {
    // ageYears rides along as completed years, exactly as the form's own age
    // control maintains it, so the two never disagree.
    const normalized = normalizePediatricAge({ value, unit })
    return {
      ageValue: value,
      ageUnit: unit,
      ageYears: normalized ? normalized.completedYears : null,
    }
  }
  const years = unit === "YEARS" ? value : 0
  return { ageYears: years, ageValue: null, ageUnit: null }
}

export function applyEhrSelections(input: {
  plan: EhrReviewPlan
  /** The keys the clinician ticked. */
  selectedKeys: Iterable<string>
  /** The case as it stands, by canonical field name. */
  current: Record<string, unknown>
  /** The mode the case is in now. A case with no mode yet is adult. */
  currentClinicalMode?: ClinicalMode | null
  /**
   * Whether the case may change mode. False on a deployment without
   * paediatric mode: an age that would need it is refused instead.
   */
  allowModeChange?: boolean
}): EhrApplyResult {
  const byKey = new Map(input.plan.items.map(item => [item.itemKey, item]))
  const patch: Record<string, unknown> = {}
  const appliedKeys: string[] = []
  const refused: EhrApplyRefusal[] = []

  // Lists are rebuilt from what the case already holds, so accepting an
  // imported diagnosis never drops one the clinician typed — and their items
  // keep whatever provenance they arrived with.
  const lists = new Map<string, unknown[]>()

  for (const itemKey of new Set(input.selectedKeys)) {
    const item = byKey.get(itemKey)
    if (!item) { refused.push({ itemKey, reason: "unknown" }); continue }

    const objection = SELECTABLE[item.state]
    if (objection) { refused.push({ itemKey, reason: objection }); continue }

    const proposed = item.proposed
    if (proposed && typeof proposed === "object") {
      if (!lists.has(item.field)) lists.set(item.field, existingList(input.current[item.field]))
      lists.get(item.field)!.push(proposed as EhrTagValue | EhrLabValue)
    } else {
      patch[item.field] = proposed
    }
    appliedKeys.push(itemKey)
  }

  for (const [field, value] of lists) patch[field] = value

  // Age is resolved last and as a set. Written field by field it can leave the
  // case saying two different ages at once, and the mode decides which of them
  // anything downstream will actually read.
  //
  // The mode follows the age (9.13.9). The hospital's age is the age; the mode
  // is what that age means for this case, so the age chooses it rather than
  // waiting behind it.
  const currentMode: ClinicalMode = input.currentClinicalMode ?? "ADULT"
  let modeChange: ClinicalMode | null = null
  const acceptedAge = Object.keys(patch).filter(field => AGE_FIELDS.has(field))
  if (acceptedAge.length > 0) {
    const proposed = Object.fromEntries(acceptedAge.map(field => [field, patch[field]]))
    for (const field of acceptedAge) delete patch[field]
    const age = acceptedAgeOf(proposed, input.current)
    const implied: ClinicalMode | null = age
      ? isPediatricAge(age) ? "PEDIATRIC" : "ADULT"
      : null
    if (implied && implied !== currentMode && input.allowModeChange === false) {
      // Nothing of the age is written; every key that carried it is refused.
      for (const itemKey of [...appliedKeys]) {
        if (!AGE_FIELDS.has(byKey.get(itemKey)!.field)) continue
        appliedKeys.splice(appliedKeys.indexOf(itemKey), 1)
        refused.push({ itemKey, reason: "needs-mode-decision" })
      }
    } else {
      if (implied && implied !== currentMode) modeChange = implied
      if (age) Object.assign(patch, ageFor(implied ?? currentMode, age))
    }
  }

  return { patch, appliedKeys, refused, modeChange }
}

/**
 * The age the clinician accepted, as one value and unit.
 *
 * The accepted fields win over the case's own as a set: an accepted `ageYears`
 * alone is an age in years, never to be read against a paediatric `ageValue`
 * the case still holds from before (a 40-year-old would otherwise come out as
 * "7 months"). Only a lone accepted unit borrows the case's number.
 */
function acceptedAgeOf(
  proposed: Record<string, unknown>,
  current: Record<string, unknown>,
): { value: number; unit: PediatricAgeUnit } | null {
  let value: number | null
  let unit: PediatricAgeUnit
  if ("ageValue" in proposed) {
    value = num(proposed.ageValue)
    unit = (proposed.ageUnit ?? current.ageUnit ?? "YEARS") as PediatricAgeUnit
  } else if ("ageYears" in proposed) {
    value = num(proposed.ageYears)
    unit = "YEARS"
  } else {
    value = num(current.ageValue) ?? num(current.ageYears)
    unit = (proposed.ageUnit ?? "YEARS") as PediatricAgeUnit
  }
  return value === null ? null : { value, unit }
}
