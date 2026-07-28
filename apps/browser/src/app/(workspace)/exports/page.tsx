import { redirect } from "next/navigation"
import type { ResearchMetadata } from "@lospor/core/research"
import { ExportWorkspace } from "@/components/export-workspace"
import { PageHeading } from "@/components/page-heading"
import { apiServerJson } from "@/lib/api"

export default async function ExportsPage() {
  const metadata = await apiServerJson<ResearchMetadata>("/v1/research/metadata")
  if (!metadata.permissions.export) redirect("/access-denied")
  return (
    <>
      <PageHeading
        title="Governed exports"
        titleBg="Управлявани експорти"
        description="Create complete pseudonymous research files and retain a verifiable export history."
        descriptionBg="Създавайте пълни псевдонимизирани файлове и проверима история."
      />
      <ExportWorkspace />
    </>
  )
}
