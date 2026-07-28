import { cookies } from "next/headers"
import { clinicalDisplayLabel, type ClinicalLocale } from "@lospor/core/display"
import type { ResearchQualityResponse } from "@lospor/core/research"
import { apiServerJson } from "@/lib/api"
import { formatResearchCount } from "@/lib/research-disclosure"
import { messages, type TranslationKey } from "@/lib/i18n"
import { PageHeading } from "@/components/page-heading"

export default async function QualityPage() {
  const quality = await apiServerJson<ResearchQualityResponse>("/v1/research/quality")
  const store = await cookies()
  const locale: ClinicalLocale = store.get("lospor_database_locale")?.value === "bg" ? "bg" : "en"
  const message = (key: TranslationKey) => messages[locale][key]

  return (
    <>
      <PageHeading
        title="Data quality"
        titleBg="Качество на данните"
        description="Completeness, terminology mapping, finalization integrity, and timeline consistency."
        descriptionBg="Пълнота, терминологично съответствие, финализация и времева последователност."
      />
      <section className="grid metrics-grid">
        <QualityMetric label={message("allCases")} value={formatResearchCount(quality.totalCaseCount)} />
        <QualityMetric label={message("finalizedCases")} value={quality.finalizedCases ?? message("suppressedLabel")} />
        <QualityMetric
          label={message("snapshotCoverage")}
          value={quality.snapshotCoverage === null ? message("suppressedLabel") : `${quality.snapshotCoverage.toFixed(1)}%`}
          good={quality.snapshotCoverage === null ? undefined : quality.snapshotCoverage >= 99}
          locale={locale}
        />
        <QualityMetric label={message("relationalDrift")} value={quality.relationalDriftCases ?? message("suppressedLabel")} good={quality.relationalDriftCases === null ? undefined : quality.relationalDriftCases === 0} locale={locale} />
        <QualityMetric label={message("impossibleTimelines")} value={quality.impossibleTimelineCases ?? message("suppressedLabel")} good={quality.impossibleTimelineCases === null ? undefined : quality.impossibleTimelineCases === 0} locale={locale} />
      </section>
      <section className="grid equal-columns" style={{ marginTop: 14 }}>
        <div className="panel">
          <div className="panel-header"><h3>{message("terminologyMapping")}</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{message("domain")}</th><th>{message("mapped")}</th><th>{message("sourceOnly")}</th><th>{message("unmapped")}</th><th>{message("coverage")}</th></tr></thead>
              <tbody>{quality.mappings.map(row => (
                <tr key={row.domain}>
                  <td><strong>{clinicalDisplayLabel("researchDomain", row.domain, locale)}</strong></td>
                  <td className="number">{row.mapped ?? message("suppressedLabel")}</td>
                  <td className="number">{row.sourceOnly ?? message("suppressedLabel")}</td>
                  <td className="number">{row.unmapped ?? message("suppressedLabel")}</td>
                  <td className="number"><span className={`pill ${row.coverage !== null && row.coverage >= 90 ? "good" : "warn"}`}>{row.coverage === null ? message("suppressedLabel") : `${row.coverage.toFixed(1)}%`}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <div className="panel-header"><h3>{message("lowestCompleteness")}</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{message("section")}</th><th>{message("field")}</th><th>{message("present")}</th><th>{message("absent")}</th><th>{message("complete")}</th></tr></thead>
              <tbody>{[...quality.fields].sort((a, b) => (a.completeness ?? Infinity) - (b.completeness ?? Infinity)).slice(0, 25).map(row => (
                <tr key={`${row.section}.${row.field}`}>
                  <td>{clinicalDisplayLabel("researchSection", row.section, locale)}</td>
                  <td>
                    <strong>{clinicalDisplayLabel("researchField", row.field, locale)}</strong><br />
                    <code className="mono">{row.field}</code>
                  </td>
                  <td className="number">{row.present ?? message("suppressedLabel")}</td>
                  <td className="number">{row.absent ?? message("suppressedLabel")}</td>
                  <td className="number"><span className={`pill ${row.completeness === null ? "warn" : row.completeness >= 90 ? "good" : row.completeness >= 70 ? "warn" : "bad"}`}>{row.completeness === null ? message("suppressedLabel") : `${row.completeness.toFixed(1)}%`}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </section>
      <div className="notice" style={{ marginTop: 14 }}>{message("qualityScopeNote")}</div>
    </>
  )
}

function QualityMetric({
  label,
  value,
  good,
  locale = "en",
}: {
  label: string
  value: string | number
  good?: boolean
  locale?: ClinicalLocale
}) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {good !== undefined && (
        <div className={`metric-note ${good ? "" : "error"}`}>
          {good
            ? messages[locale].expectedRange
            : messages[locale].reviewRequired}
        </div>
      )}
    </div>
  )
}
