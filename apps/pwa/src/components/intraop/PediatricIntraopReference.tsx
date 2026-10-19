import { Text, View } from "react-native"
import { pediatricIntraopReference } from "@lospor/core/pediatric-calculators"
import { fastingClockTimes, type PediatricFastingCategory } from "@lospor/core/pediatric"
import { PEDIATRIC_PREOP_LABELS } from "@/components/preop/pediatric-preop-labels"
import type { IntraopPreopSummary } from "@/lib/intraop-preop-summary"
import { colors, useThemeRefresh } from "@/theme/colors"

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(String(value)), template)

/**
 * BSA, maintenance fluid and resuscitation doses for a child, in view while
 * the case runs (the same as web's PediatricIntraopReference). Worked out from
 * the preop weight, height and age each time it is drawn: nothing to accept,
 * nothing stored.
 */
export function PediatricIntraopReference({ preop, language, surgeryStart, timezone }: {
  preop: IntraopPreopSummary
  language: string
  surgeryStart?: Date | null
  timezone?: string | null
}) {
  useThemeRefresh()
  const labels = PEDIATRIC_PREOP_LABELS[language === "bg" ? "bg" : "en"]
  const reference = pediatricIntraopReference({
    weightKg: preop.weight ?? null,
    heightCm: preop.height ?? null,
    age: preop.ageValue != null && preop.ageUnit ? { value: preop.ageValue, unit: preop.ageUnit } : null,
  })
  const { bsaSquareMetres, maintenance, resuscitation } = reference
  // The assignment's hours, as the clock times they meant once surgery started.
  const fasting = fastingClockTimes(preop.pediatricFasting, surgeryStart, timezone)
  if (bsaSquareMetres == null && !maintenance && !resuscitation && fasting.length === 0) return null
  const categoryLabel = (category: PediatricFastingCategory) =>
    category === "CLEAR_FLUIDS" ? labels.clearFluids
      : category === "BREAST_MILK" ? labels.breastMilk
        : category === "INFANT_FORMULA_UNDER_1_YEAR" ? labels.formula
          : labels.solids
  const row = (title: string, lines: string[]) => (
    <View key={title} style={{ gap: 2 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800" }}>{title}</Text>
      {lines.map(line => <Text key={line} style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>{line}</Text>)}
    </View>
  )
  return (
    <View testID="pediatric-intraop-reference" style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16, gap: 10 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "900" }}>{labels.intraopReference}</Text>
      {bsaSquareMetres != null ? row(labels.bsa, [`${bsaSquareMetres} m²`]) : null}
      {maintenance ? row(labels.maintenanceFluid, [maintenance.dailyRangeMl
        ? fill(labels.maintenanceRange, { min: maintenance.dailyRangeMl.minimum, max: maintenance.dailyRangeMl.maximum })
        : fill(labels.maintenanceDaily, { daily: maintenance.dailyMl ?? 0, hourly: maintenance.hourlyMl ?? 0 })]) : null}
      {resuscitation ? row(labels.resuscitation, [
        fill(labels.shockLine, { first: resuscitation.shockJoules, escalated: resuscitation.escalatedShockJoules }),
        fill(labels.adrenalineLine, { mcg: resuscitation.adrenalineMicrograms }),
        fill(labels.amiodaroneLine, { first: resuscitation.amiodaroneFirstDoseMilligrams, second: resuscitation.amiodaroneSecondDoseMilligrams }),
      ]) : null}
      {fasting.length > 0 ? row(labels.npoTitle, fasting.map(entry =>
        fill(labels.npoStopBy, { category: categoryLabel(entry.category), time: entry.clock, hours: entry.hoursBefore })
          + (entry.previousDay ? ` · ${labels.npoPreviousDay}` : ""))) : null}
      <Text style={{ color: colors.textMuted, fontSize: 10 }}>{labels.referenceSources} · {reference.ruleVersion}</Text>
    </View>
  )
}
