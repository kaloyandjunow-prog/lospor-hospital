import type {
  ResearchCaseQueryResponse,
  ResearchMetadata,
  ResearchQualityResponse,
  ResearchQueryResponse,
} from "@lospor/core/research"
import { apiServerJson } from "@/lib/api"
import { PageHeading } from "@/components/page-heading"
import { MetricCard } from "@/components/metric-card"
import { DistributionChart } from "@/components/distribution-chart"
import { CasesTable } from "@/components/cases-table"
import { formatResearchCount } from "@/lib/research-disclosure"
import { messages, type TranslationKey } from "@/lib/i18n"
import { currentLocale } from "@/lib/server-locale"

export default async function OverviewPage() {
  const localePromise = currentLocale()
  const cohort = { version: 1 as const, filters: { statuses: ["COMPLETE" as const] } }
  const metadata = await apiServerJson<ResearchMetadata>("/v1/research/metadata")
  const queryRequest = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cohort, pagination: { skip: 0, take: 8 } }),
  }
  const [locale, query, quality, recent] = await Promise.all([
    localePromise,
    apiServerJson<ResearchQueryResponse>("/v1/research/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cohort,
        pagination: { skip: 0, take: 8 },
        metrics: [
          "caseCount",
          "pediatricRate",
          "meanAgeYears",
          "meanAgeDays",
          "meanDurationMinutes",
          "complicationRate",
          "ponvRate",
          "mappingCoverage",
          "fieldCompleteness",
        ],
        distributions: ["clinicalMode", "asa", "procedure"],
      }),
    }),
    apiServerJson<ResearchQualityResponse>("/v1/research/quality"),
    metadata.permissions.inspectCases
      ? apiServerJson<ResearchCaseQueryResponse>("/v1/research/cases/query", queryRequest)
      : Promise.resolve(null),
  ])
  const message = (key: TranslationKey) => messages[locale][key]
  const clinicalModes = query.distributions.find(item => item.id === "clinicalMode")
  const asa = query.distributions.find(item => item.id === "asa")
  const procedures = query.distributions.find(item => item.id === "procedure")

  return (
    <>
      <PageHeading
        titleKey="researchOverview"
        descriptionKey="overviewDescription"
      />
      <section className="grid metrics-grid">
        {query.metrics.slice(0, 4).map(item => <MetricCard key={item.id} metric={item} />)}
      </section>
      <section className="grid equal-columns" style={{ marginTop: 14 }}>
        <div className="panel">
          <div className="panel-header"><h3>{message("clinicalMode")}</h3></div>
          <div className="panel-body">
            {clinicalModes ? <DistributionChart distribution={clinicalModes} /> : <div className="empty">{message("noClinicalModeData")}</div>}
          </div>
        </div>
        <div className="panel">
          <div className="panel-header"><h3>{message("asaStatus")}</h3></div>
          <div className="panel-body">
            {asa ? <DistributionChart distribution={asa} /> : <div className="empty">{message("noAsaData")}</div>}
          </div>
        </div>
        <div className="panel">
          <div className="panel-header"><h3>{message("frequentProcedures")}</h3></div>
          <div className="panel-body">
            {procedures
              ? <DistributionChart distribution={procedures} />
              : <div className="empty">{message("noProcedureData")}</div>}
          </div>
        </div>
      </section>
      <section className="grid metrics-grid" style={{ marginTop: 14 }}>
        {query.metrics.slice(4).map(item => <MetricCard key={item.id} metric={item} />)}
        <div className="metric">
          <div className="metric-label">{message("snapshotCoverage")}</div>
          <div className="metric-value">
            {quality.snapshotCoverage === null ? message("suppressedLabel") : `${quality.snapshotCoverage.toFixed(1)}%`}
          </div>
          <div className="metric-note">
            {quality.finalizedCases === null
              ? `${formatResearchCount(quality.totalCaseCount)} ${message("casesInScope")}`
              : `${quality.finalizedCases} ${message("finalizedCasesSuffix")}`}
          </div>
        </div>
      </section>
      {recent && (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-header">
            <h3>{message("recentlyFinalized")}</h3>
            <span className="pill info">{recent.matchingCases} {message("total")}</span>
          </div>
          <CasesTable cases={recent.cases} />
        </section>
      )}
    </>
  )
}
