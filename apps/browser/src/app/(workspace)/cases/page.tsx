import Link from "next/link"
import { redirect } from "next/navigation"
import type { ResearchCaseQueryResponse, ResearchMetadata } from "@lospor/core/research"
import { apiServerJson } from "@/lib/api"
import { CasesTable } from "@/components/cases-table"
import { PageHeading } from "@/components/page-heading"

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const take = 50
  const metadata = await apiServerJson<ResearchMetadata>("/v1/research/metadata")
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
        title="Pseudonymous cases"
        titleBg="Псевдонимизирани случаи"
        description="Safe case-level inspection. Direct identifiers, free text, and exact calendar dates are not returned."
        descriptionBg="Безопасен преглед на случаи. Не се връщат преки идентификатори, свободен текст или точни дати."
        actions={<Link className="button primary" href="/cohorts">Filter cases</Link>}
      />
      <section className="panel">
        <div className="panel-header">
          <h3>Authorized case records</h3>
          <span className="pill info">{result.matchingCases} cases</span>
        </div>
        <CasesTable cases={result.cases} />
        <div className="toolbar end" style={{ padding: 12 }}>
          <Link
            className="button"
            aria-disabled={page === 1}
            href={page === 1 ? "/cases" : `/cases?page=${page - 1}`}
          >
            Previous
          </Link>
          <span className="scope-label">Page {page}</span>
          <Link
            className="button"
            aria-disabled={!result.pagination.hasMore}
            href={result.pagination.hasMore ? `/cases?page=${page + 1}` : `/cases?page=${page}`}
          >
            Next
          </Link>
        </div>
      </section>
    </>
  )
}
