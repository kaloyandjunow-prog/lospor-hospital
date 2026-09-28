import type { EhrReviewPlan } from "@lospor/core/ehr-import-review"

/**
 * A review plan narrowed to the laboratory results drawn during the case.
 *
 * The intraoperative labs ask the hospital system again during the operation.
 * Its answer carries the whole admission, and the preoperative review already
 * offered what was drawn before the case; offering those again here would
 * record the same preoperative result a second time, as an intraoperative
 * draw. So only results taken at or after the case start stay, and a result
 * without a draw time is left out: it cannot be placed on the case's timeline
 * at all.
 *
 * Within that, the ordinary rule holds: the newest draw of each test is ticked
 * and up to three earlier ones are kept collapsed, because the ranking is done
 * over all draws and nothing drawn before the case can outrank one drawn
 * during it.
 */
export function intraopLabsPlan(plan: EhrReviewPlan, caseStartedAt: Date): EhrReviewPlan {
  const from = caseStartedAt.getTime()
  const items = plan.items.filter(item => {
    if (item.field !== "labResults") return false
    const takenAt = (item.proposed as { takenAt?: string | null } | null)?.takenAt
    if (!takenAt) return false
    const ms = Date.parse(takenAt)
    return Number.isFinite(ms) && ms >= from
  })
  const kept = new Set(items.map(item => item.itemKey))
  // Normalised as Core keys its per-test counts.
  const tests = new Set(items.map(item =>
    String((item.proposed as { test?: string }).test ?? "").trim().toLowerCase().replace(/\s+/g, " ")))
  const forKeptTests = (counts: Record<string, number>) =>
    Object.fromEntries(Object.entries(counts).filter(([test]) => tests.has(test)))
  return {
    ...plan,
    items,
    preselectedKeys: plan.preselectedKeys.filter(key => kept.has(key)),
    supersededCountByTest: forKeptTests(plan.supersededCountByTest),
    discardedOlderByTest: forKeptTests(plan.discardedOlderByTest),
  }
}
