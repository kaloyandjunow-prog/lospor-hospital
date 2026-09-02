/**
 * What the clinician is actually asked about when an import arrives.
 *
 * An import is a set of proposals, and most of them are not worth anyone's
 * attention: a value the case already holds, a lab already imported yesterday,
 * something rejected last time. Showing all of it is how a review screen
 * teaches people to accept without reading, which is the failure mode that
 * matters here — an unread review is worse than no review, because it launders
 * an unchecked value into the record as a clinician's own edit.
 *
 * So this decides, per item: is it new, does it disagree with something the
 * clinician already wrote, is it stale, was it already refused. Nothing here
 * writes anything. Its output drives a screen; accepting is a separate,
 * deliberate act, and applies through the ordinary case-edit path.
 */

import {
  type CanonicalEhrImport,
  type EhrImportableField,
  type EhrLabValue,
  type EhrTagValue,
} from "./ehr-import"
import { requiresPediatricModeDecision } from "./pediatric"
import type { ClinicalMode, PediatricAgeUnit } from "./pediatric"

export type EhrReviewState =
  /** Nothing there yet, and nothing to argue with. Ticked when the screen opens. */
  | "preselected"
  /** The clinician already wrote something different. Shown side by side, never ticked. */
  | "conflict"
  /**
   * An age whose acceptance would imply a change of clinical mode.
   *
   * Its own state rather than a flag on another one, so the pediatric trap is
   * visible in the type and cannot be lost in a boolean nobody reads. Switching
   * mode clears the adult risk scores and every vital, and resets aiOptIn to
   * false — an import must never cause that, so this is never ticked and the
   * clinician switches mode themselves.
   */
  | "needs-mode-decision"
  /** An older result for a test that has a newer one. Kept, collapsed, not ticked. */
  | "superseded"
  /**
   * A result the hospital sent with no draw time.
   *
   * Shown so the value is not lost, never ticked, and labelled — a preoperative
   * haemoglobin is only worth anything if you know how old it is, and this one
   * could be from this morning or from six months ago. The clinician decides
   * whether they can vouch for it; the software will not pretend to know.
   */
  | "undated"
  /** The case already says exactly this. Not shown; there is nothing to decide. */
  | "unchanged"
  /** Refused on an earlier import. Never offered again. */
  | "declined"

export type EhrReviewItem = {
  field: EhrImportableField
  /** Stable across re-polls, so a refusal can be remembered against it. */
  itemKey: string
  state: EhrReviewState
  proposed: unknown
  /** What the case holds today, when that is what makes this a conflict. */
  current?: unknown
}

export type EhrReviewPlan = {
  items: EhrReviewItem[]
  /**
   * The items ticked when the screen opens.
   *
   * Only ever the "preselected" ones: a conflict, a superseded lab and an age
   * implying a mode change all require the clinician to reach for them.
   */
  preselectedKeys: string[]
  /** Older results per test, for the "3 earlier" collapse on the lab list. */
  supersededCountByTest: Record<string, number>
}

export type EhrReviewInput = {
  canonical: CanonicalEhrImport
  /** The case as it stands, by canonical field name. */
  current: Record<string, unknown>
  currentClinicalMode?: ClinicalMode | null
  /** Item keys refused on an earlier import for this case. */
  declinedKeys?: Iterable<string>
}

function norm(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).trim().toLowerCase().replace(/\s+/g, " ")
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * Identity of one proposal, stable across polls.
 *
 * A tag is keyed on its code when it has one and its label otherwise, because
 * a hospital that recodes a diagnosis is still talking about the same
 * diagnosis. A lab is keyed on test and draw time together — that pair is what
 * makes two haemoglobins three days apart two different results rather than
 * one changing its mind.
 */
export function ehrItemKey(field: EhrImportableField, item?: unknown): string {
  if (item === undefined) return field
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>
    if ("takenAt" in record) {
      // With no draw time to separate them, two results of the same test can
      // only be told apart by their values — otherwise a haemoglobin of 120
      // and one of 89 would share a key and one would silently replace the
      // other, which is exactly the collapse the draw time exists to prevent.
      return record.takenAt === null
        ? `${field}|${norm(record.test)}|undated|${norm(record.value)}`
        : `${field}|${norm(record.test)}|${record.takenAt}`
    }
    return `${field}|${norm(record.code) || norm(record.label)}`
  }
  return field
}

function currentTagKeys(field: EhrImportableField, current: unknown): Set<string> {
  if (!Array.isArray(current)) return new Set()
  return new Set(current.flatMap(item => {
    if (!item || typeof item !== "object") {
      const label = norm(item)
      return label ? [`${field}|${label}`] : []
    }
    return [ehrItemKey(field, item)]
  }))
}

const AGE_FIELDS = new Set<EhrImportableField>(["ageYears", "ageValue", "ageUnit"])

/**
 * Would accepting the proposed age put the case in the wrong clinical mode?
 *
 * Evaluated once across all the age fields in the message rather than per
 * field, because a value and a unit only mean something together: "3" is an
 * adult in years and an infant in months.
 */
function ageImpliesModeDecision(
  input: EhrReviewInput,
): boolean {
  const proposed = new Map<string, unknown>()
  for (const field of input.canonical.fields) {
    if (AGE_FIELDS.has(field.field)) proposed.set(field.field, field.value)
  }
  if (proposed.size === 0) return false

  const pick = (name: string) => proposed.has(name) ? proposed.get(name) : input.current[name]
  const num = (value: unknown) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return requiresPediatricModeDecision({
    clinicalMode: input.currentClinicalMode ?? (input.current.clinicalMode as ClinicalMode | null),
    ageValue: num(pick("ageValue")),
    ageYears: num(pick("ageYears")),
    ageUnit: (pick("ageUnit") as PediatricAgeUnit | null) ?? null,
  })
}

/**
 * Sort a field's labs newest-first and mark everything after the first for
 * each test as superseded.
 *
 * The newest result is the one that describes the patient now, so it is what
 * is offered. The earlier ones are kept rather than dropped because a falling
 * haemoglobin is the clinically interesting part and hiding it would be a
 * quiet harm — they collapse behind a count instead.
 */
function labStates(
  values: EhrLabValue[],
): Map<string, "preselected" | "superseded" | "undated"> {
  const states = new Map<string, "preselected" | "superseded" | "undated">()

  // An undated result takes no part in the ordering. It cannot be placed in a
  // trend and cannot supersede or be superseded by anything, because there is
  // no way to say which of the two came first.
  const dated = values.filter(value => value.takenAt !== null)
  for (const value of values) {
    if (value.takenAt === null) states.set(`${norm(value.test)}|`, "undated")
  }

  const ordered = [...dated].sort(
    (a, b) => new Date(b.takenAt!).getTime() - new Date(a.takenAt!).getTime(),
  )
  const seen = new Set<string>()
  for (const value of ordered) {
    const test = norm(value.test)
    states.set(`${test}|${value.takenAt}`, seen.has(test) ? "superseded" : "preselected")
    seen.add(test)
  }
  return states
}

export function buildEhrReviewPlan(input: EhrReviewInput): EhrReviewPlan {
  const declined = new Set(input.declinedKeys ?? [])
  const items: EhrReviewItem[] = []
  const supersededCountByTest: Record<string, number> = {}
  const modeDecision = ageImpliesModeDecision(input)

  for (const field of input.canonical.fields) {
    const current = input.current[field.field]

    if (field.shape === "scalar") {
      const itemKey = ehrItemKey(field.field)
      const state: EhrReviewState =
        declined.has(itemKey) ? "declined"
        : norm(current) === norm(field.value) ? "unchanged"
        : modeDecision && AGE_FIELDS.has(field.field) ? "needs-mode-decision"
        : isBlank(current) ? "preselected"
        : "conflict"
      items.push({
        field: field.field,
        itemKey,
        state,
        proposed: field.value,
        ...(state === "conflict" ? { current } : {}),
      })
      continue
    }

    if (field.shape === "tags") {
      // A list is added to, not replaced. A diagnosis the hospital knows and
      // the clinician has not written is new information, not a disagreement
      // with what they did write — so a tag is never a conflict, and accepting
      // one never removes anything the clinician entered.
      const existing = currentTagKeys(field.field, current)
      for (const tag of field.value as EhrTagValue[]) {
        const itemKey = ehrItemKey(field.field, tag)
        items.push({
          field: field.field,
          itemKey,
          state:
            declined.has(itemKey) ? "declined"
            : existing.has(itemKey) ? "unchanged"
            : "preselected",
          proposed: tag,
        })
      }
      continue
    }

    const existing = currentTagKeys(field.field, current)
    const states = labStates(field.value as EhrLabValue[])
    for (const lab of field.value as EhrLabValue[]) {
      const itemKey = ehrItemKey(field.field, lab)
      const freshness = states.get(`${norm(lab.test)}|${lab.takenAt ?? ""}`) ?? "preselected"
      const state: EhrReviewState =
        declined.has(itemKey) ? "declined"
        : existing.has(itemKey) ? "unchanged"
        : freshness
      if (state === "superseded") {
        const test = norm(lab.test)
        supersededCountByTest[test] = (supersededCountByTest[test] ?? 0) + 1
      }
      items.push({ field: field.field, itemKey, state, proposed: lab })
    }
  }

  return {
    items,
    preselectedKeys: items.filter(i => i.state === "preselected").map(i => i.itemKey),
    supersededCountByTest,
  }
}

/** What the screen shows. An unchanged or refused item is not a question. */
export function visibleReviewItems(plan: EhrReviewPlan): EhrReviewItem[] {
  return plan.items.filter(i => i.state !== "unchanged" && i.state !== "declined")
}
