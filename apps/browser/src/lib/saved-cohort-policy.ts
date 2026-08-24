import type { SavedResearchCohort } from "@lospor/core/research"

export type SavedCohortEditInput = {
  name: string
  description: string
  visibility: SavedResearchCohort["visibility"]
  originalVisibility: SavedResearchCohort["visibility"]
}

export function canManageSavedCohort(
  cohort: Pick<SavedResearchCohort, "ownerId">,
  currentUserId: string,
  canSavePrivateCohorts: boolean,
) {
  return canSavePrivateCohorts
    && currentUserId.length > 0
    && cohort.ownerId === currentUserId
}

export function savedCohortPatch(
  input: SavedCohortEditInput,
  canShareInstitutionCohorts: boolean,
) {
  const name = input.name.trim()
  if (!name) throw new Error("COHORT_NAME_REQUIRED")
  if (
    input.visibility === "INSTITUTION"
    && input.visibility !== input.originalVisibility
    && !canShareInstitutionCohorts
  ) {
    throw new Error("COHORT_SHARE_FORBIDDEN")
  }

  return {
    name,
    description: input.description.trim() || null,
    ...(input.visibility !== input.originalVisibility
      ? { visibility: input.visibility }
      : {}),
  }
}
