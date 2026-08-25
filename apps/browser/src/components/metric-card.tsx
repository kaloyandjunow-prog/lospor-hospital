"use client"

import { clinicalDisplayLabel } from "@lospor/core/display"
import type { ResearchMetric } from "@lospor/core/research"
import { messages, type Locale } from "@/lib/i18n"
import { useLocale } from "./locale-provider"

function metricValue(metric: ResearchMetric, locale: Locale): string {
  if (metric.suppressed) return "<5"
  if (metric.value == null) return "—"
  const rounded = Number.isInteger(metric.value) ? String(metric.value) : metric.value.toFixed(1)
  if (metric.unit === "percent") return `${rounded}%`
  if (metric.unit === "minutes") return `${rounded} ${messages[locale].minutesShort}`
  if (metric.unit === "years") return `${rounded} ${messages[locale].yearsShort}`
  return rounded
}

export function MetricCard({ metric }: { metric: ResearchMetric }) {
  const { locale, message } = useLocale()
  return (
    <div className="metric">
      <div className="metric-label">{clinicalDisplayLabel("researchMetric", metric.id, locale)}</div>
      <div className="metric-value">{metricValue(metric, locale)}</div>
      <div className="metric-note">
        {metric.suppressed
          ? message("smallGroupSuppressed")
          : metric.denominator != null
            ? `${message("basedOn")} ${metric.denominator} ${message("casesLabel").toLowerCase()}`
            : message("researchCohortLabel")}
      </div>
    </div>
  )
}
