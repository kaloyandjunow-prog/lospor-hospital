import Link from "next/link"
import { redirect } from "next/navigation"
import type { ResearchCaseQueryResponse, ResearchMetadata } from "@lospor/core/research"
import { apiServerJson } from "@/lib/api"
import { CasesTable } from "@/components/cases-table"
import { PageHeading } from "@/components/page-heading"
import { messages } from "@/lib/i18n"
import { currentLocale } from "@/lib/server-locale"

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const take = 50
  const [metadata, locale] = await Promise.all([
    apiServerJson<ResearchMetadata>("/v1/research/metadata"),
    currentLocale(),
  ])
  const message = messages[locale]
  if (!metadata.permissions.inspectCases) redirect("/access-denied")

  const result = await apiServerJson<ResearchCaseQueryResponse>("/v1/research/cases/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cohort: { version: 1, filters: { statuses: ["COMPLETE"] } },
      pagination: { skip: (page - 1) * take, take },
      metrics: ["caseCount"],
      distributions: [],
    }),
  })

  return (
    <>
      <PageHeading
        titleKey="pseudonymousCases"
        descriptionKey="casesDescription"
        actions={<Link className="button primary" href="/cohorts">{message.filterCases}</Link>}
      />
      <section className="panel">
        <div className="panel-header">
          <h3>{message.authorizedRecords}</h3>
          <span className="pill info">{result.matchingCases} {message.casesLabel}</span>
        </div>
        <CasesTable cases={result.cases} />
        <div className="toolbar end" style={{ padding: 12 }}>
          <Link
            className="button"
            aria-disabled={page === 1}
            href={page === 1 ? "/cases" : `/cases?page=${page - 1}`}
          >
            {message.previous}
          </Link>
          <span className="scope-label">{message.page} {page}</span>
          <Link
            className="button"
            aria-disabled={!result.pagination.hasMore}
            href={result.pagination.hasMore ? `/cases?page=${page + 1}` : `/cases?page=${page}`}
          >
            {message.next}
          </Link>
        </div>
      </section>
    </>
  )
}
