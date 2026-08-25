import type { ResearchMetadata } from "@lospor/core/research"
import { GovernanceWorkspace } from "@/components/governance-workspace"
import { PageHeading } from "@/components/page-heading"
import { apiServerJson } from "@/lib/api"

export default async function GovernancePage() {
  const metadata = await apiServerJson<ResearchMetadata>("/v1/research/metadata")
  return (
    <>
      <PageHeading
        titleKey="governanceTitle"
        descriptionKey="governanceDescription"
      />
      <GovernanceWorkspace metadata={metadata} />
    </>
  )
}
