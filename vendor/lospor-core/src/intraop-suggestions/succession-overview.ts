import { CLINICAL_EVENT_CATS } from "../catalog/intraop-events"
import { SEED_SUCCESSION, SUCCESSION_MIN_CASES, mergeSuccession, successionAutomationId, type SuccessionLink } from "../event-succession"

/**
 * What "Likely now" is working from, for the hospital to read in Status (10.2.0): each link, whether it is still
 * a starting value or has been learned from this hospital's cases, and how far the learning has got. Counts only;
 * no case or clinician.
 */
export type SuccessionOverviewRow = {
  /** The switch id, `succession:<from>><to>`; one switch covers the link in every technique family. */
  id: string
  /** The technique family, e.g. "general" or "neuraxial:child". */
  context: string
  family: string
  child: boolean
  from: string
  to: string
  fromBg: string
  toBg: string
  /** Of `total` cases, `count` went from `from` to `to` next. Starting values read "of 20". */
  count: number
  total: number
  /** count / total, 0-1, two decimals. */
  share: number
  gapMinutes: number
  source: "starting" | "learned"
  /** Finished cases of this family where `from` was charted, so far. */
  learnedCases: number
  /** The cases a starting event needs before what was learned replaces its starting values. */
  minCases: number
}

const EVENT_BG = new Map(CLINICAL_EVENT_CATS.flatMap(category => category.events.map(event => [event.label, event.labelBg] as const)))
const FAMILY_ORDER = ["general", "neuraxial", "block", "sedation", "local", "other"]
const groupKey = (item: Pick<SuccessionLink, "context" | "from">) => `${item.context}\u0000${item.from}`

export function successionOverview(learned: readonly SuccessionLink[], minCases = SUCCESSION_MIN_CASES): SuccessionOverviewRow[] {
  const learnedCases = new Map<string, number>()
  for (const item of learned) learnedCases.set(groupKey(item), Math.max(learnedCases.get(groupKey(item)) ?? 0, item.total))
  const learnedKeys = new Set(learned.map(item => `${groupKey(item)}\u0000${item.to}`))
  const merged = mergeSuccession(SEED_SUCCESSION, learned, minCases)
  const rows = merged.map((item): SuccessionOverviewRow => {
    const [family = "other", child] = item.context.split(":")
    const cases = learnedCases.get(groupKey(item)) ?? 0
    return {
      id: successionAutomationId(item.from, item.to),
      context: item.context,
      family,
      child: child === "child",
      from: item.from,
      to: item.to,
      fromBg: EVENT_BG.get(item.from) ?? item.from,
      toBg: EVENT_BG.get(item.to) ?? item.to,
      count: item.count,
      total: item.total,
      share: item.total > 0 ? Math.round((item.count / item.total) * 100) / 100 : 0,
      gapMinutes: item.gapMinutes,
      source: cases >= minCases && learnedKeys.has(`${groupKey(item)}\u0000${item.to}`) ? "learned" : "starting",
      learnedCases: cases,
      minCases,
    }
  })
  const familyRank = (row: SuccessionOverviewRow) => (FAMILY_ORDER.indexOf(row.family) + 1 || FAMILY_ORDER.length + 1) * 2 + (row.child ? 1 : 0)
  return rows.sort((a, b) => familyRank(a) - familyRank(b) || a.from.localeCompare(b.from) || b.share - a.share || a.to.localeCompare(b.to))
}
