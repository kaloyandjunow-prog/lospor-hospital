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
import { normalizePediatricAge } from "./pediatric"
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
     * An age whose acceptance would imply a change of clinical mode.
     *
     * Refused rather than written even when explicitly ticked. The clinician
     * changes mode themselves, and the plan is then rebuilt — at which point
     * the age is an ordinary proposal. Making the order structural is the
     * point: it leaves no sequence of clicks that writes an age into a case
     * whose mode disagrees with it.
     */
    | "needs-mode-decision"
}

export type EhrApplyResult = {
  /** A patch by canonical field name, exactly as the clinician's own edit. */
  patch: Record<string, unknown>
  /** Keys that were written, for recording what this import contributed. */
  appliedKeys: string[]
  refused: EhrApplyRefusal[]
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
  mode: ClinicalMode | null | undefined,
  proposed: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const pick = (name: string) => name in proposed ? proposed[name] : current[name]
  const unit = (pick("ageUnit") as PediatricAgeUnit | null) ?? "YEARS"
  const value = num(pick("ageValue")) ?? num(pick("ageYears"))
  if (value === null) return {}

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
  /** Decides which fields an accepted age is written into. */
  currentClinicalMode?: ClinicalMode | null
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
  const acceptedAge = Object.keys(patch).filter(field => AGE_FIELDS.has(field))
  if (acceptedAge.length > 0) {
    const proposed = Object.fromEntries(acceptedAge.map(field => [field, patch[field]]))
    for (const field of acceptedAge) delete patch[field]
    Object.assign(patch, ageFor(input.currentClinicalMode, proposed, input.current))
  }

  return { patch, appliedKeys, refused }
}
