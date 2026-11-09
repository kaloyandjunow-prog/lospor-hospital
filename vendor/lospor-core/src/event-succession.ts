import { CLINICAL_EVENT_CATS } from "./catalog/intraop-events"
import { techniqueFamily, type TechniqueFamily } from "./intraop-domain"
import { automationEnabled, type IntraopAutomationSettings, type UserAutomationSwitches } from "./intraop-automation"
import { airwayClinicalEvent } from "./airway-smart"
import { accessKindOf } from "./vascular-access-lines"
import { vascularClinicalEvent } from "./vascular-smart"

/**
 * What usually comes next on the timeline (10.2.0): a counting engine over how events were logged in finished cases.
 *
 * For each case, take the events in time order and count which event followed which. After "Positioned" came
 * "Incision" in 91% of cases, a typical 4 minutes later. Nothing here is a model in the machine-learning sense: it is
 * counting, so every suggestion can say why. It starts from values written by hand (SEED_SUCCESSION) and a link
 * switches to what the cases show once enough cases have been seen. It only ever suggests; it never logs.
 *
 * The count uses event names, their order and the gaps between them. It never reads a patient or a user.
 * Complications and resuscitation events are not part of it: what to do when something goes wrong is not learned.
 */

/** The events whose order is learned: every clinical event that is not a complication or a resuscitation event. */
export const SEQUENCE_EVENTS: ReadonlySet<string> = new Set(
  CLINICAL_EVENT_CATS.filter(category => !category.isComplication && category.cat !== "Resuscitation").flatMap(category => category.events.map(event => event.label)),
)

/** The technique family that sets the order of events, and whether the patient is a child. */
export type SuccessionContext = { family: TechniqueFamily; child: boolean }

const FAMILY_ORDER: readonly TechniqueFamily[] = ["general", "neuraxial", "block", "sedation", "local", "other"]

/** A general anaesthetic sets the airway events whatever else is on the list; after it, a neuraxial technique, and so on. */
export function successionContext(techniques: readonly string[], child: boolean): SuccessionContext {
  const families = new Set(techniques.map(techniqueFamily))
  return { family: FAMILY_ORDER.find(family => families.has(family)) ?? "other", child }
}

export const successionContextKey = (context: SuccessionContext): string => `${context.family}${context.child ? ":child" : ""}`

export type SuccessionLink = {
  /** successionContextKey, or "*" for every case. */
  context: string
  from: string
  to: string
  /** Cases where `from` was followed next by `to`. */
  count: number
  /** Cases where `from` was charted at all. */
  total: number
  /** The usual minutes from `from` to `to`. */
  gapMinutes: number
}

const link = (context: string, from: string, to: string, count: number, gapMinutes: number, total = 20): SuccessionLink => ({ context, from, to, count, total, gapMinutes })

/**
 * The starting values: what a typical case does, written by hand. They are replaced, one starting event at a time,
 * by what the cases show. Each reads "of 20 cases, this many went from A to B".
 */
export const SEED_SUCCESSION: readonly SuccessionLink[] = Object.freeze([
  link("general", "Induction", "Intubated", 11, 3), link("general", "Induction", "LMA in", 6, 3), link("general", "Induction", "Mask vent", 2, 2),
  link("general", "Mask vent", "Intubated", 10, 2), link("general", "Mask vent", "LMA in", 6, 2),
  link("general", "Intubated", "Positioned", 15, 5), link("general", "LMA in", "Positioned", 15, 5),
  link("general", "Positioned", "Incision", 18, 5), link("general", "Procedure ended", "Extubated", 17, 5),
  link("neuraxial", "Spinal in", "Positioned", 16, 3), link("neuraxial", "Epidural in", "Positioned", 14, 5), link("neuraxial", "CSE", "Positioned", 14, 3),
  link("neuraxial", "Positioned", "Incision", 18, 8),
  link("block", "Positioned", "Incision", 17, 5), link("sedation", "Positioned", "Incision", 17, 5),
  link("local", "Positioned", "Incision", 17, 5), link("other", "Positioned", "Incision", 17, 5),
])

/* ---------- counting from finished cases ---------- */

export type SuccessionStructuredRecords = {
  airway?: ReadonlyArray<{ device?: unknown; insertedAt?: unknown; status?: unknown; reason?: unknown; replacedBy?: unknown; sourceEventId?: unknown }>
  vascular?: ReadonlyArray<{ type?: unknown; site?: unknown; insertedAt?: unknown; preexisting?: unknown; origin?: unknown; sourceEventId?: unknown }>
}

export type SuccessionCase = {
  context: SuccessionContext
  events: ReadonlyArray<{ label: string; ts: string; id?: string }>
  structured?: SuccessionStructuredRecords
}

/** Two paths can describe the same clinical action: a structured Airway or
 * vascular row and the clinical event written alongside it. They normally
 * share a timestamp, but older clients can differ by a few milliseconds. */
const DUPLICATE_EVIDENCE_WINDOW_MS = 1_000

const validInstant = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value))

/** Convert structured records into deduplicated sequence evidence. */
export function successionEvidence(
  events: ReadonlyArray<{ label?: string | null; ts: string; id?: string }>,
  structured?: SuccessionStructuredRecords,
): Array<{ label: string; ts: string; id?: string }> {
  const evidence = events
    .filter(event => !!event.label && SEQUENCE_EVENTS.has(event.label) && validInstant(event.ts))
    .map(event => ({ label: event.label!, ts: event.ts, ...(event.id ? { id: event.id } : {}) }))

  const airway = [...(structured?.airway ?? [])]
    .filter(entry => validInstant(entry.insertedAt))
    .sort((a, b) => Date.parse(a.insertedAt as string) - Date.parse(b.insertedAt as string))
  let hadTrachealTube = false
  for (const entry of airway) {
    const device = typeof entry.device === "string" ? entry.device : ""
    // `reason` and `replacedBy` are copied onto both sides of an exchange.
    // Only the new, active row describes the replacement event. A failed row
    // is an unsuccessful attempt and must not turn the next successful ETT
    // into a reintubation.
    const replaces = entry.status === "in_use" && (entry.reason != null || entry.replacedBy != null)
    const priorAtThisTime = evidence.some(event =>
      (event.label === "Intubated" || event.label === "Reintubation")
      // A clinical event within the duplicate window is the other recording
      // of this same insertion, not evidence that the tube was already in.
      && Date.parse(event.ts) < Date.parse(entry.insertedAt as string) - DUPLICATE_EVIDENCE_WINDOW_MS,
    )
    const label = airwayClinicalEvent(device, { replaces, priorTrachealTube: hadTrachealTube || priorAtThisTime })
    const linkedEvent = typeof entry.sourceEventId === "string" && evidence.some(event => event.id === entry.sourceEventId)
    if (label && !linkedEvent) evidence.push({ label, ts: entry.insertedAt as string })
    if ((device === "ORAL_ETT" || device === "NASAL_ETT") && entry.status !== "failed") hadTrachealTube = true
  }

  for (const entry of structured?.vascular ?? []) {
    if (!validInstant(entry.insertedAt) || entry.preexisting === true || (entry.origin != null && entry.origin !== "here")) continue
    const site = typeof entry.site === "string" ? entry.site : null
    const rawType = typeof entry.type === "string" ? entry.type : accessKindOf(site)
    const type = rawType === "VENOUS" ? "PERIPHERAL" : rawType
    if (type !== "PERIPHERAL" && type !== "ARTERIAL" && type !== "CENTRAL") continue
    const sourceEventId = typeof entry.sourceEventId === "string" ? entry.sourceEventId : null
    if (!sourceEventId || !evidence.some(event => event.id === sourceEventId)) {
      evidence.push({ label: vascularClinicalEvent(type as "PERIPHERAL" | "ARTERIAL" | "CENTRAL", site), ts: entry.insertedAt as string })
    }
  }

  const seen = new Map<string, number[]>()
  return evidence
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .filter(event => {
      const at = Date.parse(event.ts)
      const sameLabel = seen.get(event.label) ?? []
      if (sameLabel.some(previous => Math.abs(previous - at) <= DUPLICATE_EVIDENCE_WINDOW_MS)) return false
      sameLabel.push(at)
      seen.set(event.label, sameLabel)
      return true
    })
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 10) / 10
}

/**
 * The links the cases show. In each case the first time an event was charted counts once, and what followed it next
 * (the next different sequence event) is its successor. An event that was last has no successor, so the counts for
 * one starting event can sum to less than its total: the rest are cases where nothing followed.
 */
export function buildSuccessionStats(cases: readonly SuccessionCase[]): SuccessionLink[] {
  const totals = new Map<string, number>()
  const counts = new Map<string, { count: number; gaps: number[] }>()
  for (const item of cases) {
    const context = successionContextKey(item.context)
    const ordered = successionEvidence(item.events, item.structured)
    const seen = new Set<string>()
    for (const [index, event] of ordered.entries()) {
      if (seen.has(event.label)) continue
      seen.add(event.label)
      const totalKey = `${context}\u0000${event.label}`
      totals.set(totalKey, (totals.get(totalKey) ?? 0) + 1)
      const next = ordered.slice(index + 1).find(candidate => candidate.label !== event.label)
      if (!next) continue
      const key = `${context}\u0000${event.label}\u0000${next.label}`
      const entry = counts.get(key) ?? { count: 0, gaps: [] }
      entry.count += 1
      entry.gaps.push((Date.parse(next.ts) - Date.parse(event.ts)) / 60_000)
      counts.set(key, entry)
    }
  }
  return [...counts.entries()].map(([key, entry]) => {
    const [context, from, to] = key.split("\u0000") as [string, string, string]
    return { context, from, to, count: entry.count, total: totals.get(`${context}\u0000${from}`) ?? entry.count, gapMinutes: median(entry.gaps) }
  })
}

/** Cases a starting event must have been seen in before what the cases show replaces the starting values for it. */
export const SUCCESSION_MIN_CASES = 30

/**
 * The starting values, with every starting event whose own cases have been seen often enough replaced by what they
 * show. A starting event is replaced whole: its learned links stand in for all of its starting links in that context.
 */
export function mergeSuccession(seed: readonly SuccessionLink[], learned: readonly SuccessionLink[], minCases = SUCCESSION_MIN_CASES): SuccessionLink[] {
  const learnedGroups = new Map<string, SuccessionLink[]>()
  for (const item of learned) learnedGroups.set(`${item.context}\u0000${item.from}`, [...(learnedGroups.get(`${item.context}\u0000${item.from}`) ?? []), item])
  const enough = new Set([...learnedGroups.entries()].filter(([, group]) => (group[0]?.total ?? 0) >= minCases).map(([key]) => key))
  return [
    ...seed.filter(item => !enough.has(`${item.context}\u0000${item.from}`)),
    ...learned.filter(item => enough.has(`${item.context}\u0000${item.from}`)),
  ]
}

/* ---------- what is likely now ---------- */

export type LikelyEvent = { event: string; from: string; probability: number; gapMinutes: number; minutesSince: number }

export type LikelyNextInput = {
  /** The timeline's events: the clinical events with their times. Anything charted counts as done. */
  log: ReadonlyArray<{ label?: string | null; ts: string }>
  structured?: SuccessionStructuredRecords
  context: SuccessionContext
  links: readonly SuccessionLink[]
  now: Date | string | number
  /** Events the clinician set aside on this case. */
  dismissed?: readonly string[]
  settings?: IntraopAutomationSettings | null
  user?: UserAutomationSwitches | null
  /** Least probability to be suggested, and how many to give. */
  minProbability?: number
  limit?: number
}

export const successionAutomationId = (from: string, to: string) => `succession:${from}>${to}`
export const SUCCESSION_ANSWER_KIND = "succession"
/** Persisted answer for a definitive, case-scoped succession dismissal. */
export const SUCCESSION_DISMISS_ANSWER = "dismissed"

export function successionDismissedIds(log: ReadonlyArray<{ type: string; answerKind?: string; answerFor?: string; answer?: string; suggestion?: string }>): string[] {
  return [...new Set(log.flatMap(event => {
    // `not_now` is accepted only for old succession records written before
    // definitive dismissal existed. New records use `dismissed`; ordinary
    // clinical questions continue to use `not_now` and never reach this path.
    if (event.type !== "prompt_answer" || event.answerKind !== SUCCESSION_ANSWER_KIND
      || (event.answer !== SUCCESSION_DISMISS_ANSWER && event.answer !== "not_now")) return []
    const id = event.suggestion ?? event.answerFor
    return id?.startsWith("succession:") ? [id] : []
  }))]
}

/**
 * The events likely to come next, most likely first. The last sequence event charted decides it; if that one leads
 * nowhere, one of the last three before it does. Only events not yet charted on this case are given, and only once the
 * usual gap has passed since the event they follow.
 */
export function likelyNext(input: LikelyNextInput): LikelyEvent[] {
  const { log, context, links, dismissed = [], minProbability = 0.4, limit = 2 } = input
  const at = new Date(input.now).getTime()
  const evidence = successionEvidence(log, input.structured)
  const charted = evidence
    .filter(event => Date.parse(event.ts) <= at)
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
  // Anything already on the chart counts as done, including an event planned
  // later in the case: Likely now never offers what is already logged.
  const done = new Set([
    ...log.flatMap(event => (event.label ? [event.label] : [])),
    ...evidence.map(event => event.label),
  ])
  const key = successionContextKey(context)
  const mine = (from: string) => links.filter(item => item.from === from && (item.context === key || item.context === "*"))

  for (const recent of charted.slice(0, 3)) {
    const options = mine(recent.label)
      .map(item => ({ item, probability: item.total > 0 ? item.count / item.total : 0, minutesSince: (at - Date.parse(recent.ts)) / 60_000 }))
      .filter(({ item, probability, minutesSince }) => probability >= minProbability && minutesSince >= item.gapMinutes
        && !done.has(item.to) && !dismissed.includes(successionAutomationId(item.from, item.to)) && !dismissed.includes(item.to)
        && automationEnabled(input.settings, "reminders", successionAutomationId(item.from, item.to), input.user))
      .sort((a, b) => b.probability - a.probability)
    if (options.length > 0) {
      return options.slice(0, limit).map(({ item, probability, minutesSince }) => ({ event: item.to, from: item.from, probability: Math.round(probability * 100) / 100, gapMinutes: item.gapMinutes, minutesSince: Math.round(minutesSince) }))
    }
    // This event has links, but none is due or open: stop here rather than reach back to an older step.
    if (mine(recent.label).length > 0) return []
  }
  return []
}

/** Links as the server sent them: only well-formed ones, with sensible numbers; anything else is dropped. */
export function parseSuccessionLinks(value: unknown): SuccessionLink[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): SuccessionLink[] => {
    if (!item || typeof item !== "object") return []
    const { context, from, to, count, total, gapMinutes } = item as Record<string, unknown>
    if (typeof context !== "string" || typeof from !== "string" || typeof to !== "string") return []
    if (!SEQUENCE_EVENTS.has(from) || !SEQUENCE_EVENTS.has(to)) return []
    if (![count, total, gapMinutes].every(number => typeof number === "number" && Number.isFinite(number) && number >= 0)) return []
    if ((count as number) > (total as number) || (total as number) <= 0) return []
    return [{ context, from, to, count: count as number, total: total as number, gapMinutes: gapMinutes as number }]
  })
}
