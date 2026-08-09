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

export default async function OverviewPage() {
  const cohort = { version: 1 as const, filters: { statuses: ["COMPLETE" as const] } }
  const metadata = await apiServerJson<ResearchMetadata>("/v1/research/metadata")
  const queryRequest = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cohort, pagination: { skip: 0, take: 8 } }),
  }
  const [query, quality, recent] = await Promise.all([
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
  const clinicalModes = query.distributions.find(item => item.id === "clinicalMode")
  const asa = query.distributions.find(item => item.id === "asa")
  const procedures = query.distributions.find(item => item.id === "procedure")

  return (
    <>
      <PageHeading
        title="Research overview"
        titleBg="Изследователско обобщение"
        description="Finalized perioperative activity inside your authorized data scope."
        descriptionBg="Завършена периоперативна дейност в рамките на разрешения обхват."
      />
      <section className="grid metrics-grid">
        {query.metrics.slice(0, 4).map(item => <MetricCard key={item.id} metric={item} />)}
      </section>
      <section className="grid equal-columns" style={{ marginTop: 14 }}>
        <div className="panel">
          <div className="panel-header"><h3>Clinical mode</h3></div>
          <div className="panel-body">
            {clinicalModes ? <DistributionChart distribution={clinicalModes} /> : <div className="empty">No clinical mode data</div>}
          </div>
        </div>
        <div className="panel">
          <div className="panel-header"><h3>ASA physical status</h3></div>
          <div className="panel-body">
            {asa ? <DistributionChart distribution={asa} /> : <div className="empty">No ASA data</div>}
          </div>
        </div>
        <div className="panel">
          <div className="panel-header"><h3>Most frequent procedures</h3></div>
          <div className="panel-body">
            {procedures
              ? <DistributionChart distribution={procedures} />
              : <div className="empty">No procedure data</div>}
          </div>
        </div>
      </section>
      <section className="grid metrics-grid" style={{ marginTop: 14 }}>
        {query.metrics.slice(4).map(item => <MetricCard key={item.id} metric={item} />)}
        <div className="metric">
          <div className="metric-label">Snapshot coverage</div>
          <div className="metric-value">
            {quality.snapshotCoverage === null ? "Suppressed" : `${quality.snapshotCoverage.toFixed(1)}%`}
          </div>
          <div className="metric-note">
            {quality.finalizedCases === null ? `${formatResearchCount(quality.totalCaseCount)} cases in scope` : `${quality.finalizedCases} finalized cases`}
          </div>
        </div>
      </section>
      {recent && (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-header">
            <h3>Recently finalized cases</h3>
            <span className="pill info">{recent.matchingCases} total</span>
          </div>
          <CasesTable cases={recent.cases} />
        </section>
      )}
    </>
  )
}
