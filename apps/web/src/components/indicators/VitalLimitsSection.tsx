"use client"

import { useLocale, useTranslations } from "next-intl"
import { VITAL_SIGN_KEYS, vitalQuestionsEnabled } from "@lospor/core/intraop-automation"
import { FIXED_HEART_RATE, VITAL_BANDS, vitalLimitsFor, vitalSignAbbreviation } from "@lospor/core/vital-questions"
import { useIntraopAutomation } from "@/lib/use-intraop-automation"
import { Section } from "./IndicatorWidgets"

/**
 * The limits the vitals questions use, per age band (10.1.0), read-only for
 * everyone in the department: how many cases each band rests on, whether its
 * statistics are in use yet, and the low and high limit per sign beside the
 * fixed heart-rate rules. Shown only when the hospital has the questions on.
 */
export function VitalLimitsSection() {
  const t = useTranslations("indicators")
  const locale = useLocale()
  const { settings, stats } = useIntraopAutomation()
  if (!vitalQuestionsEnabled(settings)) return null
  return (
    <Section id="vital-limits" title={t("s_vitalLimits")}>
      <p className="text-xs text-slate-500 mb-2">{t("vitalLimitsHint", { min: settings.vitalQuestions.minCases })}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums" data-testid="vital-limits">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 pr-3">{t("band")}</th>
              <th className="py-1 pr-3 text-right">{t("bandCases")}</th>
              {VITAL_SIGN_KEYS.map(sign => <th key={sign} className="py-1 pr-3 text-right">{vitalSignAbbreviation(sign, locale)}</th>)}
              <th className="py-1 text-right">{t("fixedHr")}</th>
            </tr>
          </thead>
          <tbody>
            {VITAL_BANDS.map(band => {
              const limits = vitalLimitsFor(stats, settings, band.key)
              const cases = Math.max(...VITAL_SIGN_KEYS.map(sign => limits[sign].cases))
              const fixed = FIXED_HEART_RATE[band.key]
              return (
                <tr key={band.key} className="border-t border-slate-100 dark:border-[#2a2a2a]" data-testid={`vital-limits-${band.key}`}>
                  <td className="py-1.5 pr-3">{locale === "bg" ? band.labelBg : band.labelEn}</td>
                  <td className="py-1.5 pr-3 text-right">{cases}</td>
                  {VITAL_SIGN_KEYS.map(sign => (
                    <td key={sign} className="py-1.5 pr-3 text-right">
                      {limits[sign].active ? `< ${limits[sign].low} · > ${limits[sign].high}` : <span className="text-slate-400">{t("collecting")}</span>}
                    </td>
                  ))}
                  <td className="py-1.5 text-right text-slate-500">{`< ${fixed.bradycardiaBelow} · > ${fixed.tachycardiaAbove}`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Section>
  )
}
