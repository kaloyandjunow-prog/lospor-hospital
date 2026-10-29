"use client"

import { useTranslations } from "next-intl"
import {
  FPSR_SCORES,
  NRS_SCORES,
  painBandLabel,
  scaleText,
  type PainBand,
  type PainLanguage,
  type ScaleItem,
} from "@lospor/core/postop-pain"

/**
 * The postoperative pain and delirium scales, entered the way each is defined
 * (10.0.0): FLACC, NIPS and PAED item by item, FPS-R by face, NRS by number.
 * No sliders: a slider showed a value before anyone had scored. A second tap
 * on the chosen answer clears it.
 */

const BAND_TONE: Record<PainBand, string> = {
  none: "border-green-500 bg-green-500 text-white dark:bg-green-700 dark:border-green-600",
  mild: "border-lime-500 bg-lime-500 text-white dark:bg-lime-700 dark:border-lime-600",
  moderate: "border-amber-500 bg-amber-500 text-white dark:bg-amber-700 dark:border-amber-600",
  severe: "border-red-500 bg-red-500 text-white dark:bg-red-700 dark:border-red-600",
}
const IDLE = "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-[#3a3a3a] dark:text-slate-300 dark:hover:border-[#555] dark:hover:bg-[#1e1e1e]"
const PICKED = "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-600"

export function ScaleTotal({ label, total, max, band, language }: {
  label: string
  total: number | null
  max: number
  band: PainBand | string | null
  language: PainLanguage
}) {
  const t = useTranslations()
  const bandText = band == null ? null : (["none", "mild", "moderate", "severe"] as string[]).includes(band) ? painBandLabel(band as PainBand, language) : band
  const tone = band && band in BAND_TONE ? BAND_TONE[band as PainBand] : "border-slate-300 text-slate-700 dark:border-[#444] dark:text-slate-200"
  return (
    <div className="flex items-center gap-2 border-t border-slate-100 pt-2 dark:border-[#2a2a2a]">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <span className={`rounded-md border px-2 py-0.5 text-sm font-bold ${total == null ? "border-slate-200 text-slate-400 dark:border-[#333]" : tone}`} data-testid={`${label.toLowerCase().replace(/[^a-z]/g, "")}-total`}>
        {total ?? "—"} / {max}
      </span>
      <span className="text-xs text-slate-500">{total == null ? t("postop.pain.notComplete") : bandText}</span>
    </div>
  )
}

/** A scale scored item by item: each row its behaviour, each button an answer with its points. */
export function ItemScale<K extends string>({ items, values, onChange, language, testId }: {
  items: readonly ScaleItem<K>[]
  values: Partial<Record<K, number | null | undefined>>
  onChange: (key: K, value: number | null) => void
  language: PainLanguage
  testId: string
}) {
  return (
    <div className="space-y-3" data-testid={testId}>
      {items.map(item => (
        <div key={item.key}>
          <p className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">{scaleText(item, language)}</p>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${item.choices.length}, minmax(0, 1fr))` }}>
            {item.choices.map(choice => {
              const selected = values[item.key] === choice.points
              return (
                <button
                  key={`${item.key}-${choice.points}-${choice.labelEn}`}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(item.key, selected ? null : choice.points)}
                  className={`min-h-11 rounded-lg border-2 px-1.5 py-1.5 text-center transition-colors ${selected ? PICKED : IDLE}`}
                >
                  <div className="text-base font-bold leading-none">{choice.points}</div>
                  <div className="mt-1 text-[10px] leading-tight opacity-90">{scaleText(choice, language)}</div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/** FPS-R's six faces (0, 2 ... 10) or NRS's eleven numbers, as buttons. */
export function SelfReportScale({ kind, value, onChange }: {
  kind: "FPS_R" | "NRS"
  value: number | null | undefined
  onChange: (value: number | null) => void
}) {
  const t = useTranslations()
  const scores: readonly number[] = kind === "FPS_R" ? FPSR_SCORES : NRS_SCORES
  return (
    <div className="space-y-1" data-testid={kind === "FPS_R" ? "fpsr-scale" : "nrs-scale"}>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${scores.length}, minmax(0, 1fr))` }}>
        {scores.map(score => {
          const selected = value === score
          return (
            <button
              key={score}
              type="button"
              aria-pressed={selected}
              aria-label={`${kind === "FPS_R" ? "FPS-R" : "NRS"} ${score}`}
              onClick={() => onChange(selected ? null : score)}
              className={`min-h-11 rounded-lg border-2 text-base font-bold transition-colors ${selected ? PICKED : IDLE}`}
            >
              {kind === "FPS_R" ? <FaceGlyph score={score} /> : null}
              <span className={kind === "FPS_R" ? "block text-xs" : ""}>{score}</span>
            </button>
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{t("postop.pain.noPain")}</span>
        <span>{t(kind === "FPS_R" ? "postop.pain.veryMuchPain" : "postop.pain.worstPain")}</span>
      </div>
    </div>
  )
}

/**
 * A plain line face for each FPS-R step, for orientation only: the child is
 * shown the scale's own faces, which are not reproduced here.
 */
function FaceGlyph({ score }: { score: number }) {
  const step = score / 2 // 0..5
  const mouth = -step * 1.4 // a level mouth at 0, as on the scale, turning down
  return (
    <svg viewBox="0 0 24 24" className="mx-auto h-6 w-6" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8.5" cy="10" r="1.1" fill="currentColor" />
      <circle cx="15.5" cy="10" r="1.1" fill="currentColor" />
      <path d={`M7.5 16 Q12 ${16 + mouth} 16.5 16`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
