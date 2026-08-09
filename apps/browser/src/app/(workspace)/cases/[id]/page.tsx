import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import {
  clinicalDisplayLabel,
  resolveClinicalDisplay,
  type ClinicalDisplayDomain,
  type ClinicalLocale,
} from "@lospor/core/display"
import type { ResearchCaseDetail, ResearchMappedTerm } from "@lospor/core/research"
import { apiServerFetch } from "@/lib/api"
import {
  displayResearchAge,
  displayResearchFieldValue,
  displayTimelineEvent,
  optionDisplayLabel,
} from "@/lib/clinical-display"
import { messages, type TranslationKey } from "@/lib/i18n"
import { PageHeading } from "@/components/page-heading"

export default async function ResearchCasePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const store = await cookies()
  const locale: ClinicalLocale = store.get("lospor_database_locale")?.value === "bg" ? "bg" : "en"
  const message = (key: TranslationKey) => messages[locale][key]
  const response = await apiServerFetch(`/v1/research/cases/${encodeURIComponent(id)}`)
  if (response.status === 404) notFound()
  if (response.status === 403) redirect("/access-denied")
  if (!response.ok) throw new Error("Unable to load the research case")
  const item = await response.json() as ResearchCaseDetail
  const sex = item.sex ? optionDisplayLabel("SEX", item.sex, locale) : "-"

  return (
    <>
      <PageHeading
        title={item.researchId}
        description={`${item.period ?? message("unknownPeriod")} / ${clinicalDisplayLabel("caseStatus", item.status, locale)} / ${clinicalDisplayLabel("clinicalMode", item.clinicalMode, locale)}`}
        actions={
          item.quality.warnings.length
            ? <span className="pill warn">{item.quality.warnings.length} {message("qualityWarnings")}</span>
            : <span className="pill good">{message("researchReady")}</span>
        }
      />
      <section className="grid metrics-grid">
        <Summary label={message("ageSex")} value={`${displayResearchAge(item, locale)} / ${sex}`} />
        <Summary label={clinicalDisplayLabel("researchField", "clinicalMode", locale)} value={clinicalDisplayLabel("clinicalMode", item.clinicalMode, locale)} />
        <Summary label="ASA" value={item.asa ?? "—"} />
        <Summary label={message("duration")} value={item.durationMinutes != null ? `${item.durationMinutes} min` : "—"} />
        <Summary label={message("completeness")} value={`${item.completeness.toFixed(1)}%`} />
      </section>
      <section className="grid equal-columns" style={{ marginTop: 14 }}>
        <DataPanel title={message("demographicsRisks")} values={item.demographics} locale={locale} />
        <DataPanel title={message("intraoperativeSummary")} values={item.intraoperative} locale={locale} />
        <ListPanel title={message("diagnoses")} items={item.diagnoses} domain="diagnosis" locale={locale} emptyLabel={message("noStructuredRecords")} />
        <ListPanel title={message("procedures")} items={item.procedures} domain="procedure" locale={locale} emptyLabel={message("noStructuredRecords")} />
        <ListPanel title={message("comorbidities")} items={item.comorbidities} domain="diagnosis" locale={locale} emptyLabel={message("noStructuredRecords")} />
        <DataPanel title={message("postoperativeOutcome")} values={item.postoperative} locale={locale} />
      </section>
      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-header"><h3>{message("relativeTimeline")}</h3></div>
        <div className="panel-body timeline">
          {!item.timeline.length && <div className="empty">{message("noStructuredEvents")}</div>}
          {item.timeline.map(event => (
            <div className="timeline-row" key={event.id}>
              <div className="timeline-minute">{event.minute == null ? "—" : `+${event.minute} min`}</div>
              <div className="timeline-axis" />
              <div className="timeline-event">
                <strong>{displayTimelineEvent(event, locale)}</strong>
                {(event.value != null || event.unit) && (
                  <span>{event.value ?? ""} {event.unit ?? ""}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
      {!!item.labs.length && (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-header"><h3>{message("laboratoryResults")}</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>LOINC</th><th>{message("testLabel")}</th><th>{message("valueLabel")}</th><th>{message("flagLabel")}</th><th>{message("mappingLabel")}</th></tr></thead>
              <tbody>{item.labs.map((row, index) => (
                <tr key={`${row.code}-${index}`}>
                  <td className="mono">{row.code ?? "—"}</td>
                  <td>{resolveClinicalDisplay("labTest", row.code ?? row.label, locale, {
                    label: row.label,
                    labelEn: row.labelEn,
                    labelBg: row.labelBg,
                  }).label}</td>
                  <td>{row.value ?? "—"} {row.unit ?? ""}</td>
                  <td><span className={`pill ${row.flag === "high" || row.flag === "critical" ? "bad" : ""}`}>
                    {row.flag ? clinicalDisplayLabel("labFlag", row.flag, locale) : "—"}
                  </span></td>
                  <td>{clinicalDisplayLabel("mappingStatus", row.mappingStatus, locale)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="metric"><div className="metric-label">{label}</div><div className="metric-value">{value}</div></div>
}

type ResearchPanelValues = Record<string, string | number | boolean | string[] | null>

function dataPanelEntries(values: ResearchPanelValues) {
  return Object.entries(values)
}

function DataPanel({
  title,
  values,
  locale,
}: {
  title: string
  values: ResearchPanelValues
  locale: ClinicalLocale
}) {
  return (
    <div className="panel">
      <div className="panel-header"><h3>{title}</h3></div>
      <div className="table-wrap">
        <table><tbody>{dataPanelEntries(values).map(([key, value]) => (
          <tr key={key}>
            <td>{clinicalDisplayLabel("researchField", key, locale)}</td>
            <td className="number">{Array.isArray(value)
              ? value.map(item => displayResearchFieldValue(key, item, locale)).join(", ") || "—"
              : displayResearchFieldValue(key, value, locale)}</td>
          </tr>
        ))}</tbody></table>
      </div>
    </div>
  )
}

function ListPanel({
  title,
  items,
  domain,
  locale,
  emptyLabel,
}: {
  title: string
  items: ResearchMappedTerm[]
  domain: Extract<ClinicalDisplayDomain, "diagnosis" | "procedure">
  locale: ClinicalLocale
  emptyLabel: string
}) {
  return (
    <div className="panel">
      <div className="panel-header"><h3>{title}</h3></div>
      {!items.length ? <div className="empty">{emptyLabel}</div> : (
        <div className="table-wrap">
          <table><tbody>{items.map((item, index) => (
            <tr key={`${item.code}-${index}`}>
              <td className="mono">{item.code ?? "—"}</td>
              <td>{resolveClinicalDisplay(domain, item.code ?? item.label, locale, {
                label: item.label,
                labelEn: item.labelEn,
                labelBg: item.labelBg,
              }).label}</td>
              <td><span className={`pill ${item.mappingStatus === "MAPPED" ? "good" : "warn"}`}>
                {clinicalDisplayLabel("mappingStatus", item.mappingStatus, locale)}
              </span></td>
            </tr>
          ))}</tbody></table>
        </div>
      )}
    </div>
  )
}
