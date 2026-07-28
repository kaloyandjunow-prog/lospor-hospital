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
