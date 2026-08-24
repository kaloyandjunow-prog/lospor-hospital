import type { ResearchMetadata } from "@lospor/core/research"
import { CohortsWorkspace } from "@/components/cohorts-workspace"
import { PageHeading } from "@/components/page-heading"
import { apiServerJson, currentSession } from "@/lib/api"

export default async function CohortsPage() {
  const [metadata, session] = await Promise.all([
    apiServerJson<ResearchMetadata>("/v1/research/metadata"),
    currentSession(),
  ])
  return (
    <>
      <PageHeading
        titleKey="cohortBuilder"
        descriptionKey="cohortDescription"
      />
      <CohortsWorkspace metadata={metadata} currentUserId={session?.user.id ?? ""} />
    </>
  )
}
