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
  /**
   * A result whose unit we could not convert into ours.
   *
   * The number is the laboratory's, in the laboratory's unit, so it cannot be
   * read against our reference ranges and must not be written into a field that
   * assumes they apply — 8.9 is a normal haemoglobin in g/dL and a transfusion
   * in g/L. Shown, labelled with what was reported, and never ticked; the
   * software will not guess which scale a number is on.
   */
  | "unconverted"
  /**
   * A test this product does not record at all.
   *
   * An intensive-care panel carries dozens of analytes LOSPOR has no field for.
   * They arrive with nowhere to go — nothing to read them against, no concept to
   * export them as — and because the case holds nothing for them they would
   * otherwise read as new information and be ticked by default, so an ordinary
   * "accept" would take eighty rows of them.
   *
   * Shown, because the hospital did send them and hiding that is its own kind of
   * dishonesty. Never ticked, and refused if ticked: the honest thing is to say
   * this is not something we record.
   */
  | "unsupported-test"
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
  /** Older results per test that are kept, for the "3 earlier" collapse. */
  supersededCountByTest: Record<string, number>
  /**
   * Older results per test dropped from the plan entirely, beyond the few kept.
   *
   * Reported so the screen can say so. A fortnight of six-hourly results is not
   * a review screen, but discarding them without saying is how a clinician comes
   * to believe they have seen everything the hospital sent.
   */
  discardedOlderByTest: Record<string, number>
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
      // The value is part of the identity, dated or not.
      //
      // A hospital can call one of our tests by more than one of its own
      // codes — a main-laboratory haemoglobin and a blood-gas one, a legacy
      // code alongside its replacement — and both can be drawn at the same
      // moment. Keyed on test and time alone those two collide, and because
      // the staging table is unique on this key, one result is silently lost.
      //
      // Including the value also keeps deduplication working: the same result
      // seen again on a re-poll is byte-identical and still collapses. The
      // cost is that a value stored in a different format ("89.0" against an
      // earlier "89") reads as a new result and is offered again. That is the
      // right way round to be wrong — an extra row the clinician can dismiss,
      // rather than a result that disappears without anyone seeing it.
      return `${field}|${norm(record.test)}|${record.takenAt ?? "undated"}|${norm(record.value)}`
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
/**
 * How many earlier results per test are kept for the clinician to open.
 *
 * A patient two weeks in intensive care has a haemoglobin every six hours, and
 * a real message carried three hundred of them: three hundred staged rows and
 * three hundred rows on a screen, because "collapses behind a count" described
 * the display and nothing enforced it.
 *
 * The current value is what describes the patient now; the priors are there so
 * a falling trend is visible, and a slope needs a handful of points rather than
 * a fortnight of them. The rest are discarded from the plan and reported as a
 * number, because a silent discard and an honest one are different things.
 *
 * Scope beyond that is the record number's job: a request is made against one
 * ИЗ, which is one admission, so nothing here reaches back into a previous one.
 */
const OLDER_RESULTS_KEPT_PER_TEST = 3

function labStates(
  values: EhrLabValue[],
): Map<string, "preselected" | "superseded" | "undated" | "discarded"> {
  const states = new Map<string, "preselected" | "superseded" | "undated" | "discarded">()

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
  const seenPerTest = new Map<string, number>()
  for (const value of ordered) {
    const test = norm(value.test)
    const rank = seenPerTest.get(test) ?? 0
    seenPerTest.set(test, rank + 1)
    states.set(`${test}|${value.takenAt}`,
      rank === 0 ? "preselected"
      : rank <= OLDER_RESULTS_KEPT_PER_TEST ? "superseded"
      : "discarded")
  }
  return states
}

export function buildEhrReviewPlan(input: EhrReviewInput): EhrReviewPlan {
  const declined = new Set(input.declinedKeys ?? [])
  const items: EhrReviewItem[] = []
  const supersededCountByTest: Record<string, number> = {}
  const discardedOlderByTest: Record<string, number> = {}
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
      // Ordered so a refusal still wins, and so an unconvertible unit outranks
      // freshness: the newest result is the one worth offering, but only once
      // its number means what our field says it means.
      // Too old to be worth a row. Counted rather than silently dropped, and
      // checked before anything else so an ancient result cannot re-enter the
      // plan by being, say, unconvertible.
      if (freshness === "discarded") {
        const test = norm(lab.test)
        discardedOlderByTest[test] = (discardedOlderByTest[test] ?? 0) + 1
        continue
      }

      const state: EhrReviewState =
        declined.has(itemKey) ? "declined"
        : existing.has(itemKey) ? "unchanged"
        : lab.unsupported ? "unsupported-test"
        : lab.unconverted ? "unconverted"
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
    discardedOlderByTest,
  }
}

/** What the screen shows. An unchanged or refused item is not a question. */
export function visibleReviewItems(plan: EhrReviewPlan): EhrReviewItem[] {
  return plan.items.filter(i => i.state !== "unchanged" && i.state !== "declined")
}
