"use client"

import { useEffect, useState } from "react"
import { Play } from "lucide-react"
import { clinicalDisplayLabel } from "@lospor/core/display"
import type {
  ResearchBenchmarkResponse,
  ResearchMetadata,
  ResearchMetricId,
} from "@lospor/core/research"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { apiJson } from "@/lib/client-api"
import { useLocale } from "./locale-provider"

export function BenchmarkWorkspace() {
  const { locale, message } = useLocale()
  const [metadata, setMetadata] = useState<ResearchMetadata | null>(null)
  const [metric, setMetric] = useState<ResearchMetricId>("caseCount")
  const [interval, setInterval] = useState<"month" | "quarter" | "year">("month")
  const [institutionIds, setInstitutionIds] = useState<string[]>([])
  const [result, setResult] = useState<ResearchBenchmarkResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    void apiJson<ResearchMetadata>("/research/metadata").then(value => {
      setMetadata(value)
      setInstitutionIds(value.scope.institutionIds)
    }).catch(caught => setError(caught instanceof Error ? caught.message : "Metadata failed"))
  }, [])

  async function run() {
    setLoading(true)
    setError("")
    try {
      setResult(await apiJson<ResearchBenchmarkResponse>("/research/benchmarks", {
        method: "POST",
        body: JSON.stringify({
          cohort: { version: 1, filters: { statuses: ["COMPLETE"] } },
          interval,
          metric,
          institutionIds,
        }),
      }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Benchmark failed")
    } finally {
      setLoading(false)
    }
  }

  const institutionOptions = metadata?.scope.institutionIds.map((id, index) => ({
    id,
    label: metadata.scope.institutionLabels[index] ?? id,
  })) ?? []
  const lines = [...new Set(result?.points.map(point => point.institutionLabel ?? "Scope") ?? [])]
  const periods = [...new Set(result?.points.map(point => point.period) ?? [])]
  const chartData = periods.map(period => {
    const row: Record<string, string | number | null> = { period }
    for (const point of result?.points.filter(item => item.period === period) ?? []) {
      row[point.institutionLabel ?? "Scope"] = point.value
    }
    return row
  })
  const colors = ["#0f766e", "#356b9a", "#b7791f", "#b54455", "#357a52", "#6f5c9a"]

  return (
    <div className="grid">
      <section className="panel">
        <div className="panel-header"><h3>{message("benchmarkDefinition")}</h3></div>
        <div className="panel-body">
          <div className="filter-grid">
            <div className="field">
              <label>{message("metric")}</label>
              <select className="select" value={metric} onChange={e => setMetric(e.target.value as ResearchMetricId)}>
                <option value="caseCount">{clinicalDisplayLabel("researchMetric", "caseCount", locale)}</option>
                <option value="meanAgeYears">{clinicalDisplayLabel("researchMetric", "meanAgeYears", locale)}</option>
                <option value="meanDurationMinutes">{clinicalDisplayLabel("researchMetric", "meanDurationMinutes", locale)}</option>
                <option value="complicationRate">{clinicalDisplayLabel("researchMetric", "complicationRate", locale)}</option>
                <option value="fieldCompleteness">{clinicalDisplayLabel("researchMetric", "fieldCompleteness", locale)}</option>
              </select>
            </div>
            <div className="field">
              <label>{message("interval")}</label>
              <select className="select" value={interval} onChange={e => setInterval(e.target.value as typeof interval)}>
                <option value="month">{message("month")}</option><option value="quarter">{message("quarter")}</option><option value="year">{message("year")}</option>
              </select>
            </div>
          </div>
          {!!institutionOptions.length && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>{message("institutions")}</label>
              <div className="toolbar">
                {institutionOptions.map(option => (
                  <label className="pill" key={option.id}>
                    <input
                      type="checkbox"
                      checked={institutionIds.includes(option.id)}
                      onChange={event => setInstitutionIds(current =>
                        event.target.checked
                          ? [...current, option.id]
                          : current.filter(id => id !== option.id))}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="toolbar end" style={{ marginTop: 14 }}>
            <button className="button primary" type="button" onClick={run} disabled={loading}>
              <Play size={15} /> {loading ? message("calculating") : message("runBenchmark")}
            </button>
          </div>
          {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
        </div>
      </section>
      {result && (
        <section className="panel">
          <div className="panel-header">
            <h3>{clinicalDisplayLabel("researchMetric", result.metric, locale)} · {message(result.interval)}</h3>
            <span className="pill info">{result.points.length} {message("pointsLabel")}</span>
          </div>
          <div className="panel-body">
            {!chartData.length ? <div className="empty">{message("noBenchmarkData")}</div> : (
              <div className="chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#e3e8e6" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    {lines.map((line, index) => (
                      <Line key={line} type="monotone" dataKey={line} stroke={colors[index % colors.length]} strokeWidth={2} connectNulls={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
