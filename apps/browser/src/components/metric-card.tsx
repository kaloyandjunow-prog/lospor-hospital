"use client"

import { clinicalDisplayLabel } from "@lospor/core/display"
import type { ResearchMetric } from "@lospor/core/research"
import { useLocale } from "./locale-provider"

function metricValue(metric: ResearchMetric): string {
  if (metric.suppressed) return "<5"
  if (metric.value == null) return "—"
  const rounded = Number.isInteger(metric.value) ? String(metric.value) : metric.value.toFixed(1)
  if (metric.unit === "percent") return `${rounded}%`
  if (metric.unit === "minutes") return `${rounded} min`
  if (metric.unit === "years") return `${rounded} y`
  return rounded
}

export function MetricCard({ metric }: { metric: ResearchMetric }) {
  const { locale } = useLocale()
  return (
    <div className="metric">
      <div className="metric-label">{clinicalDisplayLabel("researchMetric", metric.id, locale)}</div>
      <div className="metric-value">{metricValue(metric)}</div>
      <div className="metric-note">
        {metric.suppressed
          ? (locale === "bg" ? "Малката група е скрита" : "Small group suppressed")
          : metric.denominator != null
            ? (locale === "bg" ? `На база ${metric.denominator} случая` : `Based on ${metric.denominator} cases`)
            : (locale === "bg" ? "Изследователска кохорта" : "Research cohort")}
      </div>
    </div>
  )
}
