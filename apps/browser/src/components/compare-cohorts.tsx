"use client"

import { useState } from "react"
import { GitCompareArrows } from "lucide-react"
import { clinicalDisplayLabel, type ClinicalLocale } from "@lospor/core/display"
import type {
  ResearchCohortDefinition,
  ResearchComparisonResponse,
} from "@lospor/core/research"
import { apiJson } from "@/lib/client-api"
import { formatOptionalResearchCount } from "@/lib/research-disclosure"
import { useLocale } from "./locale-provider"

type Side = {
  label: string
  from: string
  to: string
  clinicalMode: "" | "ADULT" | "PEDIATRIC"
  asa: string
  diagnosis: string
  procedure: string
  emergency: string
}

const initial = (label: string): Side => ({
  label,
  from: "",
  to: "",
  clinicalMode: "",
  asa: "",
  diagnosis: "",
  procedure: "",
  emergency: "",
})

function cohort(side: Side): ResearchCohortDefinition {
  return {
    version: 1,
    filters: {
      statuses: ["COMPLETE"],
      ...(side.from || side.to ? { finalized: {
        ...(side.from ? { from: side.from } : {}),
        ...(side.to ? { to: side.to } : {}),
      } } : {}),
      ...(side.clinicalMode ? { clinicalModes: [side.clinicalMode] } : {}),
      ...(side.asa ? { asa: side.asa.split(",").map(item => item.trim()).filter(Boolean) } : {}),
      ...(side.diagnosis ? { diagnosisCodes: side.diagnosis.split(",").map(item => item.trim()).filter(Boolean) } : {}),
      ...(side.procedure ? { procedureCodes: side.procedure.split(",").map(item => item.trim()).filter(Boolean) } : {}),
      ...(side.emergency ? { emergency: side.emergency === "true" } : {}),
    },
  }
}

export function CompareCohorts() {
  const { locale, message } = useLocale()
  const [left, setLeft] = useState(initial("Cohort A"))
  const [right, setRight] = useState(initial("Cohort B"))
  const [result, setResult] = useState<ResearchComparisonResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function run() {
    setLoading(true)
    setError("")
    try {
      setResult(await apiJson<ResearchComparisonResponse>("/research/compare", {
        method: "POST",
        body: JSON.stringify({
          left: cohort(left),
          right: cohort(right),
          metrics: [
            "caseCount",
            "pediatricRate",
            "meanAgeYears",
            "meanAgeDays",
            "meanBmi",
            "meanDurationMinutes",
            "emergencyRate",
            "highRiskRate",
            "complicationRate",
            "ponvRate",
            "meanAldrete",
            "meanPainScore",
            "mappingCoverage",
            "fieldCompleteness",
          ],
        }),
      }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Comparison failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid">
      <section className="grid equal-columns">
        <SideEditor side={left} onChange={setLeft} message={message} locale={locale} />
        <SideEditor side={right} onChange={setRight} message={message} locale={locale} />
      </section>
      <div className="toolbar end">
        <button className="button primary" type="button" onClick={run} disabled={loading}>
          <GitCompareArrows size={16} />
          {loading ? message("comparing") : message("compareCohorts")}
        </button>
      </div>
      {error && <div className="notice error">{error}</div>}
      {result && (
        <section className="panel">
          <div className="panel-header">
            <h3>{message("comparison")}</h3>
            <span className="scope-label">{formatOptionalResearchCount(result.leftCount, result.leftCaseCount)} vs {formatOptionalResearchCount(result.rightCount, result.rightCaseCount)} {message("casesLabel")}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{message("metric")}</th><th>{left.label}</th><th>{right.label}</th><th>{message("difference")}</th><th>{message("relative")}</th></tr></thead>
              <tbody>
                {result.metrics.map(item => (
                  <tr key={item.id}>
                    <td><strong>{clinicalDisplayLabel("researchMetric", item.id, locale)}</strong></td>
                    <td>{show(item.left.value, item.left.suppressed, item.left.unit)}</td>
                    <td>{show(item.right.value, item.right.suppressed, item.right.unit)}</td>
                    <td>{item.absoluteDifference == null ? "—" : item.absoluteDifference.toFixed(1)}</td>
                    <td>{item.relativeDifferencePercent == null ? "—" : `${item.relativeDifferencePercent.toFixed(1)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function show(value: number | null, suppressed: boolean, unit?: string) {
  if (suppressed) return "<5"
  if (value == null) return "—"
  return `${value.toFixed(Number.isInteger(value) ? 0 : 1)}${unit === "percent" ? "%" : ""}`
}

function SideEditor({
  side,
  onChange,
  message,
  locale,
}: {
  side: Side
  onChange: (side: Side) => void
  message: ReturnType<typeof useLocale>["message"]
  locale: ClinicalLocale
}) {
  const update = (key: keyof Side, value: string) => onChange({ ...side, [key]: value })
  return (
    <div className="panel">
      <div className="panel-header">
        <input className="input" aria-label="Cohort label" value={side.label} onChange={e => update("label", e.target.value)} />
      </div>
      <div className="panel-body filter-grid">
        <Field label={message("finalizedFrom")}> <input className="input" type="date" value={side.from} onChange={e => update("from", e.target.value)} /></Field>
        <Field label={message("finalizedTo")}> <input className="input" type="date" value={side.to} onChange={e => update("to", e.target.value)} /></Field>
        <Field label={clinicalDisplayLabel("researchField", "clinicalMode", locale)}>
          <select className="select" value={side.clinicalMode} onChange={e => update("clinicalMode", e.target.value)}>
            <option value="">{message("any")}</option>
            <option value="ADULT">{clinicalDisplayLabel("clinicalMode", "ADULT", locale)}</option>
            <option value="PEDIATRIC">{clinicalDisplayLabel("clinicalMode", "PEDIATRIC", locale)}</option>
          </select>
        </Field>
        <Field label="ASA"><input className="input" placeholder="II, III" value={side.asa} onChange={e => update("asa", e.target.value)} /></Field>
        <Field label={message("diagnosisIcd")}> <input className="input" placeholder="I10" value={side.diagnosis} onChange={e => update("diagnosis", e.target.value)} /></Field>
        <Field label={message("procedureCode")}> <input className="input" value={side.procedure} onChange={e => update("procedure", e.target.value)} /></Field>
        <Field label={message("urgency")}> 
          <select className="select" value={side.emergency} onChange={e => update("emergency", e.target.value)}>
            <option value="">{message("any")}</option><option value="true">{message("emergency")}</option><option value="false">{message("elective")}</option>
          </select>
        </Field>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>
}
