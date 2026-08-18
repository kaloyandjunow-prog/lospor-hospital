"use client"

import { useTranslations } from "next-intl"
import { apfelRiskLabel, rcriRiskLabel, stopBangRiskLabel } from "@/lib/scores"

/**
 * The three calculated preoperative risk scores.
 *
 * Each card carries how many of its criteria were actually answered, and only
 * when some were not. The calculators treat an unasked criterion as absent --
 * deliberately, and documented: a question nobody put to the patient must not
 * count toward a score. But a bare number and a colour band read identically
 * whether every criterion was answered "no" or never asked at all, which is the
 * one thing the card must not leave ambiguous.
 *
 * The score and the band are unchanged. Suppressing them on partial input would
 * trade one misreading for another; a partial score is still the best available
 * estimate as long as it says what it rests on.
 *
 * Only criteria that can be "not asked" are counted. highRiskSurgery and
 * emergencySurgery are binary by design -- not emergent means elective -- and
 * BMI, age and sex are derived rather than asked.
 */

type Card = {
  titleKey: "preop.rcriShort" | "preop.apfelShort" | "preop.stopBangShort"
  score: number
  max: number
  label: string
  tone: string
  answered: number
  criteria: number
}

function toneFor(score: number, amber: number, red: number): string {
  if (score >= red) return "text-red-500"
  if (score >= amber) return "text-amber-500"
  return "text-emerald-600"
}

export function RiskScoreCards({
  rcriScore, apfelScore, stopBangScore,
  rcriAnswered, apfelAnswered, stopBangAnswered,
}: {
  rcriScore: number
  apfelScore: number
  stopBangScore: number
  rcriAnswered: number
  apfelAnswered: number
  stopBangAnswered: number
}) {
  const t = useTranslations()

  const cards: Card[] = [
    {
      titleKey: "preop.rcriShort", score: rcriScore, max: 6,
      label: rcriRiskLabel(rcriScore), tone: toneFor(rcriScore, 2, 3),
      answered: rcriAnswered, criteria: 5,
    },
    {
      titleKey: "preop.apfelShort", score: apfelScore, max: 4,
      label: apfelRiskLabel(apfelScore), tone: toneFor(apfelScore, 2, 3),
      answered: apfelAnswered, criteria: 3,
    },
    {
      titleKey: "preop.stopBangShort", score: stopBangScore, max: 8,
      label: stopBangRiskLabel(stopBangScore), tone: toneFor(stopBangScore, 3, 5),
      answered: stopBangAnswered, criteria: 5,
    },
  ]

  return (
    <div className="pt-1 border-t border-slate-100 dark:border-[#2a2a2a]">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
        {t("preop.calculatedRiskScores")}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map(card => (
          <div
            key={card.titleKey}
            className="rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#181818] p-4"
          >
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              {t(card.titleKey)}
            </p>
            <p className="text-3xl font-bold text-slate-700 dark:text-slate-100">
              {card.score}
              <span className="text-base font-normal text-slate-400">/{card.max}</span>
            </p>
            <p className={`text-xs font-semibold mt-1.5 ${card.tone}`}>{card.label}</p>
            {card.answered < card.criteria && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1" role="note">
                {t("preop.criteriaAnswered", { answered: card.answered, total: card.criteria })}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
