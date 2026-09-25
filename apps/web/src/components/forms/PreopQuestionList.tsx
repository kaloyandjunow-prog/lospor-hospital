"use client"

import { useLocale, useTranslations } from "next-intl"
import {
  preopQuestionProgress,
  preopQuestionRows,
  type PreopAnswerState,
  type PreopAssessmentProfile,
  type PreopFormSection,
  type PreopProfileQuestion,
} from "@lospor/core/preop-assessment"
import { ClinicalYesNo } from "@/components/ClinicalYesNo"
import { cn } from "@/lib/utils"

export type PreopQuestionAnswer = {
  stableKey: string
  state: "YES" | "NO" | "UNKNOWN" | "NOT_APPLICABLE"
  optionKey?: string | null
}

export type PreopPendingSuggestion = {
  id: string
  stableKey: string
  proposedState: PreopAnswerState | null
}

/**
 * The bundled questions an operator switched on, drawn as compact yes/no rows
 * in the section they belong to.
 *
 * Which rows appear -- the operator's order, the case's population, follow-ups
 * only under a YES -- is decided in core so web and PWA draw the same form.
 * A section with nothing switched on draws nothing at all: no heading, no
 * empty card. A long section is split by the catalogue's own grouping.
 */
export function PreopQuestionList({
  profile,
  formSection,
  mode,
  states,
  onAnswer,
  suggestions = [],
  onReviewSuggestion,
  className,
}: {
  profile: Pick<PreopAssessmentProfile, "questions"> | null | undefined
  formSection: PreopFormSection
  mode: "ADULT" | "PEDIATRIC"
  states: ReadonlyMap<string, PreopAnswerState>
  onAnswer: (stableKey: string, answer: PreopQuestionAnswer | null) => void
  suggestions?: readonly PreopPendingSuggestion[]
  onReviewSuggestion?: (suggestionId: string, status: "ACCEPTED" | "REJECTED") => void
  className?: string
}) {
  const t = useTranslations()
  const locale = useLocale()
  const rows = preopQuestionRows(profile, formSection, mode, states)
  if (rows.length === 0) return null
  const progress = preopQuestionProgress(rows, states)
  const label = (question: PreopProfileQuestion) => locale === "bg" ? question.labelBg : question.labelEn

  const groups: Array<{ group: string; rows: typeof rows }> = []
  for (const row of rows) {
    const group = row.question.section
    const last = groups[groups.length - 1]
    if (last && (last.group === group || row.depth === 1)) last.rows.push(row)
    else groups.push({ group, rows: [row] })
  }

  return (
    <div className={cn("space-y-3", className)} data-testid={`preop-questions-${formSection}`}>
      <p className="text-right text-[11px] text-muted-foreground" aria-live="polite">
        {t("preop.questionsAnswered", { answered: progress.answered, total: progress.total })}
      </p>
      {groups.map(({ group, rows: groupRows }, index) => (
        <div key={`${group}-${index}`} className="space-y-2">
          {groups.length > 1 && (
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t(`preop.questionGroup.${group}`)}</p>
          )}
          {groupRows.map(({ question, depth }) => {
            const state = states.get(question.stableKey)
            const value = state === "YES" ? true : state === "NO" ? false : null
            // Offered only on an unanswered question: the clinician's own answer
            // wins, and accepting would otherwise overwrite it on the next save.
            const pending = state == null || state === "NOT_ASKED"
              ? suggestions.find(item => item.stableKey === question.stableKey)
              : undefined
            const answer = (next: PreopQuestionAnswer["state"] | null) =>
              onAnswer(question.stableKey, next ? { stableKey: question.stableKey, state: next, optionKey: next === "YES" || next === "NO" ? next : null } : null)
            return (
              <div
                key={question.stableKey}
                className={cn("flex items-start gap-2", depth === 1 && "ml-6 border-l pl-3")}
                data-testid={`preop-question-${question.stableKey}`}
              >
                <div className="flex flex-col gap-1">
                  <ClinicalYesNo
                    id={`preop-question-${question.stableKey}`}
                    value={value}
                    onChange={next => answer(next == null ? null : next ? "YES" : "NO")}
                    className="mt-0.5"
                  />
                  {(question.allowUnknown || question.allowNotApplicable) && (
                    <div className="flex gap-1">
                      {question.allowUnknown && (
                        <button type="button" aria-pressed={state === "UNKNOWN"} onClick={() => answer(state === "UNKNOWN" ? null : "UNKNOWN")}
                          className={cn("rounded-md border px-2 text-[11px]", state === "UNKNOWN" ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground")}>
                          {t("common.unknown")}
                        </button>
                      )}
                      {question.allowNotApplicable && (
                        <button type="button" aria-pressed={state === "NOT_APPLICABLE"} onClick={() => answer(state === "NOT_APPLICABLE" ? null : "NOT_APPLICABLE")}
                          className={cn("rounded-md border px-2 text-[11px]", state === "NOT_APPLICABLE" ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground")}>
                          {t("preop.notApplicable")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <label id={`preop-question-${question.stableKey}-label`} htmlFor={`preop-question-${question.stableKey}`} className="text-sm leading-snug">
                    {label(question)}
                    {question.required && <span className="ml-0.5 text-destructive" aria-label={t("common.required")}>*</span>}
                  </label>
                  {pending && onReviewSuggestion && (
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-amber-600 dark:text-amber-400">
                      {t("preop.suggestionFromRecord", { answer: pending.proposedState === "NO" ? t("common.no") : t("common.yes") })}
                      <button type="button" className="underline" onClick={() => onReviewSuggestion(pending.id, "ACCEPTED")}>{t("preop.suggestionAccept")}</button>
                      <button type="button" className="underline" onClick={() => onReviewSuggestion(pending.id, "REJECTED")}>{t("preop.suggestionReject")}</button>
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
