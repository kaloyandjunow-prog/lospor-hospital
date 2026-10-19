"use client"

import { clinicalDisplayLabel } from "@lospor/core/display"
import type { ResearchMetric } from "@lospor/core/research"
import { RESEARCH_SCORE_SCALES } from "@lospor/core/research-scores"
import { messages, type Locale } from "@/lib/i18n"
import { useLocale } from "./locale-provider"

// A mean score keeps its scale, so 8.7 reads as out of 10.
const SCORE_METRIC_SCALE: Partial<Record<ResearchMetric["id"], number>> = {
  meanAldrete: RESEARCH_SCORE_SCALES.aldreteTotal.max,
  meanPainScore: RESEARCH_SCORE_SCALES.painScore.max,
}

function metricValue(metric: ResearchMetric, locale: Locale): string {
  if (metric.suppressed) return "<5"
  if (metric.value == null) return "—"
  const rounded = Number.isInteger(metric.value) ? String(metric.value) : metric.value.toFixed(1)
  if (metric.unit === "percent") return `${rounded}%`
  if (metric.unit === "minutes") return `${rounded} ${messages[locale].minutesShort}`
  if (metric.unit === "years") return `${rounded} ${messages[locale].yearsShort}`
  const scale = SCORE_METRIC_SCALE[metric.id]
  if (scale != null) return `${rounded} / ${scale}`
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
