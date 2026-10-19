"use client"

import { useLocale, useTranslations } from "next-intl"
import { GUPTA_PROCEDURE_TYPE_QUESTION, GUPTA_PROCEDURE_TYPES, guptaFromForm } from "@lospor/core/gupta"
import { isGuptaEnabled, type PreopAssessmentProfile } from "@lospor/core/preop-assessment"
import { displayGuptaRisk } from "@lospor/core/risk-band-display"
import { toClinicalLocale } from "@/lib/clinical-display"
import type { PreopQuestionAnswer } from "./PreopQuestionList"

/**
 * Gupta MICA, shown only where the operator switched on both of its questions.
 *
 * Its two answers are drawn by the question list beside it; age, ASA and
 * creatinine come from the form. The risk is worked out here and never sent:
 * only the inputs are stored. A procedure type the planned procedures suggest
 * is offered, never filled in by itself.
 */
export function GuptaRiskCard({
  profile,
  values,
  onAnswer,
}: {
  profile: Pick<PreopAssessmentProfile, "questions"> | null | undefined
  values: Record<string, unknown>
  onAnswer: (stableKey: string, answer: PreopQuestionAnswer | null) => void
}) {
  const t = useTranslations()
  const locale = useLocale()
  if (!isGuptaEnabled(profile)) return null
  const { result, suggestedProcedureType } = guptaFromForm(values)
  const typeLabel = (key: string) => {
    const type = GUPTA_PROCEDURE_TYPES.find(item => item.key === key)
    return type ? (locale === "bg" ? type.labelBg : type.labelEn) : key
  }
  const chosenType = result.available ? result.input.procedureType : null
  const answeredType = Array.isArray(values.preopAnswers)
    && values.preopAnswers.some(answer => answer?.stableKey === GUPTA_PROCEDURE_TYPE_QUESTION && answer?.state === "YES")
  const shown = result.available ? displayGuptaRisk(result.percent, toClinicalLocale(locale)) : null

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-[#2a2a2a]" data-testid="gupta-risk-card">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t("preop.gupta.title")}</p>
      <p className="text-xs text-slate-400">{t("preop.gupta.note")}</p>
      {shown ? (
        <p className={`mt-1.5 text-sm font-semibold ${shown.severity === "high" ? "text-red-500" : "text-emerald-600"}`}>{shown.label}</p>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t("preop.gupta.missing", { inputs: result.available ? "" : result.missing.map(item => t(`preop.gupta.${item}`)).join(", ") })}
        </p>
      )}
      {result.available && result.input.creatinine === "UNKNOWN" && (
        <p className="text-[11px] text-muted-foreground">{t("preop.gupta.creatinineUnknown")}</p>
      )}
      {suggestedProcedureType && !answeredType && chosenType == null && (
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-amber-600 dark:text-amber-400">
          {t("preop.gupta.suggested", { type: typeLabel(suggestedProcedureType) })}
          <button
            type="button"
            className="underline"
            onClick={() => onAnswer(GUPTA_PROCEDURE_TYPE_QUESTION, { stableKey: GUPTA_PROCEDURE_TYPE_QUESTION, state: "YES", optionKey: suggestedProcedureType })}
          >
            {t("preop.gupta.use")}
          </button>
        </p>
      )}
    </div>
  )
}
