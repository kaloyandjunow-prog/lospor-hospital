export type DashboardCaseRouteInput = {
  status: string
  intraop?: unknown
  postop?: unknown
}

export type DashboardCaseTarget = "case" | "intraop" | "preop"

export function dashboardCaseTarget(
  item: DashboardCaseRouteInput,
  hasQueuedIntraop: boolean,
): DashboardCaseTarget {
  if (item.postop || item.status === "COMPLETE" || item.status === "AWAITING_REVIEW") return "case"
  if (item.intraop || hasQueuedIntraop) return "intraop"
  return "preop"
}
