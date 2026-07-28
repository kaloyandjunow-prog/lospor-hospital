import type { ResearchMetadata } from "@lospor/core/research"
import { CohortBuilder } from "@/components/cohort-builder"
import { PageHeading } from "@/components/page-heading"
import { SavedCohorts } from "@/components/saved-cohorts"
import { apiServerJson } from "@/lib/api"

export default async function CohortsPage() {
  const metadata = await apiServerJson<ResearchMetadata>("/v1/research/metadata")
  return (
    <>
      <PageHeading
        title="Cohort builder"
        titleBg="Създаване на кохорта"
        description="Combine controlled clinical filters. Queries are read-only and restricted to your authorized scope."
        descriptionBg="Комбинирайте контролирани клинични филтри. Заявките са само за четене и в разрешения обхват."
      />
      <CohortBuilder metadata={metadata} />
      <SavedCohorts metadata={metadata} />
    </>
  )
}
