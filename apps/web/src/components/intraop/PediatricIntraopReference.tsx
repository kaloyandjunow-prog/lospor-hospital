"use client"

import { useTranslations } from "next-intl"
import { pediatricIntraopReference } from "@lospor/core/pediatric-calculators"
import { fastingClockTimes } from "@lospor/core/pediatric"
import type { PreopSummary } from "@/components/forms/preop-summary"

/**
 * BSA, maintenance fluid and resuscitation doses for a child, in view while
 * the case runs. Worked out from the preop weight, height and age each time
 * it is drawn: nothing to accept, nothing stored (they used to need an
 * "Accept and record" in preop, which nothing ever displayed).
 */
export function PediatricIntraopReference({ preop, surgeryStart, timezone }: {
  preop: PreopSummary
  surgeryStart?: string | Date | null
  timezone?: string | null
}) {
  const t = useTranslations("pediatric")
  const reference = pediatricIntraopReference({
    weightKg: preop.weightKg,
    heightCm: preop.heightCm,
    age: preop.ageValue != null && preop.ageUnit ? { value: preop.ageValue, unit: preop.ageUnit } : null,
  })
  const { bsaSquareMetres, maintenance, resuscitation } = reference
  // The assignment's hours, as the clock times they meant once surgery started.
  const fasting = fastingClockTimes(preop.pediatricFasting, surgeryStart, timezone)
  if (bsaSquareMetres == null && !maintenance && !resuscitation && fasting.length === 0) return null
  return (
    <div className="mt-2 border-t border-amber-200 pt-2 dark:border-amber-700/40" data-testid="pediatric-intraop-reference">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">{t("intraopReference")}</p>
      <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-sm text-slate-700 dark:text-slate-200">
        {bsaSquareMetres != null && <>
          <dt className="text-slate-500 dark:text-slate-400">{t("bsa")}</dt>
          <dd>{t("bsaValue", { value: bsaSquareMetres })}</dd>
        </>}
        {maintenance && <>
          <dt className="text-slate-500 dark:text-slate-400">{t("maintenanceFluid")}</dt>
          <dd>{maintenance.dailyRangeMl
            ? t("maintenanceRange", { min: maintenance.dailyRangeMl.minimum, max: maintenance.dailyRangeMl.maximum })
            : t("maintenanceDaily", { daily: maintenance.dailyMl ?? 0, hourly: maintenance.hourlyMl ?? 0 })}</dd>
        </>}
        {resuscitation && <>
          <dt className="text-slate-500 dark:text-slate-400">{t("resuscitation")}</dt>
          <dd className="space-y-0.5">
            <span className="block">{t("shockLine", { first: resuscitation.shockJoules, escalated: resuscitation.escalatedShockJoules })}</span>
            <span className="block">{t("adrenalineLine", { mcg: resuscitation.adrenalineMicrograms })}</span>
            <span className="block">{t("amiodaroneLine", { first: resuscitation.amiodaroneFirstDoseMilligrams, second: resuscitation.amiodaroneSecondDoseMilligrams })}</span>
          </dd>
        </>}
        {fasting.length > 0 && <>
          <dt className="text-slate-500 dark:text-slate-400">{t("npoTitle")}</dt>
          <dd className="space-y-0.5" data-testid="pediatric-npo-clock">
            {fasting.map(row => (
              <span key={row.category} className="block">
                {t("npoStopBy", { category: t(`fastingCategories.${row.category}`), time: row.clock, hours: row.hoursBefore })}
                {row.previousDay ? ` · ${t("npoPreviousDay")}` : ""}
              </span>
            ))}
          </dd>
        </>}
      </dl>
      <p className="mt-1 text-[11px] text-slate-400">{t("referenceSources")} · {reference.ruleVersion}</p>
    </div>
  )
}
