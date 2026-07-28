import type { ResearchMetadata } from "@lospor/core/research"

export function formatResearchScope(
  scope: ResearchMetadata["scope"],
  allInstitutionsLabel: string,
) {
  if (scope.kind === "ALL") {
    return `${allInstitutionsLabel} (${scope.institutionLabels.length})`
  }
  if (!scope.institutionLabels.length) return allInstitutionsLabel
  if (scope.institutionLabels.length <= 2) return scope.institutionLabels.join(", ")
  return `${scope.institutionLabels[0]} +${scope.institutionLabels.length - 1}`
}
