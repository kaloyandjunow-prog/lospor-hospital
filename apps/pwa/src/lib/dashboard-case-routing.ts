export type DashboardCaseRouteInput = {
  status: string
  intraop?: unknown
  postop?: unknown
  /**
   * `canWrite: true` is the only value that grants an editor. This function
   * is only ever called with server-fetched cases -- local-only drafts route
   * through their own path in the dashboard screen and never reach here --
   * and the server always attaches `capabilities` to every case it returns.
   * So anything other than an explicit `true` here (missing, malformed, an
   * older cached response) means something is actually wrong, and the same
   * fail-closed rule `caseIsWritable` applies everywhere else applies here
   * too: a missing field must never be the thing that grants edit rights.
   */
  capabilities?: { canWrite: boolean } | null
}

export type DashboardCaseTarget = "case" | "intraop" | "preop"

export function dashboardCaseTarget(
  item: DashboardCaseRouteInput,
  hasQueuedIntraop: boolean,
): DashboardCaseTarget {
  if (item.postop || item.status === "COMPLETE" || item.status === "AWAITING_REVIEW") return "case"
  // Queued offline intraop work is exempt: it was queued while this device
  // could still write, and the only way not to lose it is to keep opening
  // intraop long enough to flush it.
  if (item.capabilities?.canWrite !== true && !hasQueuedIntraop) return "case"
  if (item.intraop || hasQueuedIntraop) return "intraop"
  return "preop"
}

/**
 * The allocation-readiness rule lives in core as `preopReadyForAllocation`,
 * shared with the web dashboard. It used to be duplicated here, and the two
 * copies disagreed in both directions -- web demanded a diagnosis and ignored
 * age and sex, this one did the reverse -- so the same case read as ready to
 * schedule on one client and not the other.
 */

export type DashboardTabCounts = {
  All: number; Today: number; Month: number; Active: number; Drafts: number
  "Awaiting Postop": number; Complete: number; Handovers: number
}

export type DashboardServerCounts = {
  all: number; today: number; month: number; active: number; drafts: number
  awaitingPostop: number; complete: number
}

export type DashboardCountableCase = {
  createdAt: string
  status: string
  intraop?: { endTime?: string | null } | null
}

/**
 * The server's true counts over every accessible case, not just the ones
 * loaded onto this screen. Falls back to counting the loaded page only if an
 * older API response has no `counts` (offline cache, a stale server) --
 * better an approximate number than none, but never preferred over the real one.
 */
export function dashboardTabCounts(
  counts: DashboardServerCounts | null,
  cases: DashboardCountableCase[],
  handoverCount: number,
  isToday: (iso: string) => boolean,
  isThisMonth: (iso: string) => boolean,
): DashboardTabCounts {
  if (counts) {
    return {
      All: counts.all, Today: counts.today, Month: counts.month, Active: counts.active,
      Drafts: counts.drafts, "Awaiting Postop": counts.awaitingPostop, Complete: counts.complete,
      Handovers: handoverCount,
    }
  }
  return {
    All: cases.length,
    Today: cases.filter(c => isToday(c.createdAt)).length,
    Month: cases.filter(c => isThisMonth(c.createdAt)).length,
    Active: cases.filter(c => c.status !== "COMPLETE").length,
    Drafts: cases.filter(c => c.status === "DRAFT").length,
    // `endTime != null`, matching both the server's count and the screen's own
    // list filter. "An intraop record exists" counted every case still in
    // theatre, so the offline fallback disagreed with the list under it as well
    // as with the server it stands in for.
    "Awaiting Postop": cases.filter(c => c.status !== "COMPLETE" && c.intraop?.endTime != null).length,
    Complete: cases.filter(c => c.status === "COMPLETE").length,
    Handovers: handoverCount,
  }
}

export type DashboardTabKey = keyof DashboardTabCounts

/**
 * Whether a case belongs on the tab currently selected.
 *
 * Beside dashboardTabCounts deliberately: the tab's number and the list under
 * it have to answer the same question, and they stopped doing so once the two
 * lived apart. "Awaiting Postop" in particular means a *finished* intraop --
 * `endTime` set -- and not merely that an intraop record exists, which is what
 * the server counts and what a case still in theatre would otherwise satisfy.
 *
 * Handovers is not a filter over cases at all; it is its own list, so nothing
 * from this one belongs on it.
 */
export function caseMatchesDashboardTab(
  caseItem: DashboardCountableCase,
  tab: DashboardTabKey,
  isToday: (iso: string) => boolean,
  isThisMonth: (iso: string) => boolean,
): boolean {
  switch (tab) {
    case "Today":           return isToday(caseItem.createdAt)
    case "Month":           return isThisMonth(caseItem.createdAt)
    case "Active":          return caseItem.status !== "COMPLETE"
    case "Drafts":          return caseItem.status === "DRAFT"
    case "Awaiting Postop": return caseItem.status !== "COMPLETE" && caseItem.intraop?.endTime != null
    case "Complete":        return caseItem.status === "COMPLETE"
    case "Handovers":       return false
    default:                return true
  }
}
