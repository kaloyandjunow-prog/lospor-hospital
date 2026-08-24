"use client"

import { useState } from "react"
import type { ResearchMetadata, SavedResearchCohort } from "@lospor/core/research"
import { CohortBuilder } from "./cohort-builder"
import { SavedCohorts } from "./saved-cohorts"

export function CohortsWorkspace({
  metadata,
  currentUserId,
}: {
  metadata: ResearchMetadata
  currentUserId: string
}) {
  const [editingCohort, setEditingCohort] = useState<SavedResearchCohort | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  return (
    <>
      <CohortBuilder
        key={editingCohort ? `${editingCohort.id}:${editingCohort.updatedAt}` : "new-cohort"}
        metadata={metadata}
        editingCohort={editingCohort}
        onCancelEdit={() => setEditingCohort(null)}
        onEditComplete={() => {
          setEditingCohort(null)
          setRefreshToken(value => value + 1)
        }}
      />
      <SavedCohorts
        metadata={metadata}
        currentUserId={currentUserId}
        refreshToken={refreshToken}
        onEditDefinition={setEditingCohort}
      />
    </>
  )
}
