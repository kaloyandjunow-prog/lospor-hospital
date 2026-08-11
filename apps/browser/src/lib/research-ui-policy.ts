import type { ResearchExportRecord, ResearchPermissionSet } from "@lospor/core/research"

export type ResearchNavigationPermission = "inspectCases" | "export" | null

export function canViewResearchNavigation(
  permissions: ResearchPermissionSet,
  required: ResearchNavigationPermission,
): boolean {
  return required === null || permissions[required]
}

export function researchExportsNeedPolling(records: ResearchExportRecord[]): boolean {
  return records.some(record => record.status === "PENDING" || record.status === "RUNNING")
}

export function researchExportArtifactExpired(
  record: ResearchExportRecord,
  now = Date.now(),
): boolean {
  if (record.status !== "COMPLETE" || !record.expiresAt) return false
  const expiresAt = Date.parse(record.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt <= now
}

export function canDownloadResearchExport(
  record: ResearchExportRecord,
  now = Date.now(),
): boolean {
  return record.status === "COMPLETE"
    && !record.legacy
    && record.artifactAvailable
    && !researchExportArtifactExpired(record, now)
}

export function canOfferOmopExport(permissions: ResearchPermissionSet): boolean {
  return permissions.export && permissions.exportOmop
}

/**
 * What a benchmark result is actually showing.
 *
 * These three used to render identically, as an empty chart. They mean very
 * different things: "withheld" is a privacy rule acting on real cases,
 * "noData" is a genuine absence, and a chart may be plottable while still
 * withholding some of its periods. A researcher who cannot tell them apart
 * reads a suppression rule as a finding about the data.
 */
export type BenchmarkChartState = "noData" | "allSuppressed" | "partiallySuppressed" | "plottable"

export function benchmarkChartState(
  points: readonly { suppressed: boolean }[],
): BenchmarkChartState {
  if (!points.length) return "noData"
  const suppressed = points.filter(point => point.suppressed).length
  if (suppressed === points.length) return "allSuppressed"
  return suppressed > 0 ? "partiallySuppressed" : "plottable"
}

/**
 * The metrics a benchmark picker may offer.
 *
 * Always the server's answer when there is one. Offering a metric the server
 * cannot plot produces an empty chart that reads as "this institution recorded
 * nothing", which is why the picker is never allowed to be the wider list.
 */
export function benchmarkMetricChoices<T>(
  supported: readonly T[] | undefined,
  fallback: readonly T[],
): readonly T[] {
  return supported?.length ? supported : fallback
}
