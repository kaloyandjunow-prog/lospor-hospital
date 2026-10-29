"use client"

import { Controller, type Control } from "react-hook-form"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import type { PostopData } from "@/components/forms/postopSchema"

export type AldreteKey = "aldreteActivity" | "aldreteRespiration" | "aldreteCirculation" | "aldreteConsciousness" | "aldreteSpO2"
type StewardKey = "stewardConsciousness" | "stewardAirway" | "stewardMovement"
type Suggestion = { score: number; text: string }

const SCORE_COLORS = [
  "bg-red-500 border-red-500 text-white dark:bg-red-700 dark:border-red-600",
  "bg-amber-500 border-amber-500 text-white dark:bg-amber-700 dark:border-amber-600",
  "bg-green-500 border-green-500 text-white dark:bg-green-700 dark:border-green-600",
]
const UNSELECTED = "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
const STEWARD_CRITERIA: { key: StewardKey; labelKey: string; scoreKeys: string[] }[] = [
  { key: "stewardConsciousness", labelKey: "postop.stewardConsciousness", scoreKeys: ["postop.steward.consciousness0", "postop.steward.consciousness1", "postop.steward.consciousness2"] },
  { key: "stewardAirway", labelKey: "postop.stewardAirway", scoreKeys: ["postop.steward.airway0", "postop.steward.airway1", "postop.steward.airway2"] },
  { key: "stewardMovement", labelKey: "postop.stewardMovement", scoreKeys: ["postop.steward.movement0", "postop.steward.movement1", "postop.steward.movement2"] },
]
const ALDRETE_CRITERIA: { key: AldreteKey; labelKey: string; scoreKeys: string[] }[] = [
  { key: "aldreteActivity", labelKey: "postop.activity", scoreKeys: ["postop.aldrete.activity0", "postop.aldrete.activity1", "postop.aldrete.activity2"] },
  { key: "aldreteRespiration", labelKey: "postop.respiration", scoreKeys: ["postop.aldrete.respiration0", "postop.aldrete.respiration1", "postop.aldrete.respiration2"] },
  { key: "aldreteCirculation", labelKey: "postop.circulation", scoreKeys: ["postop.aldrete.circulation0", "postop.aldrete.circulation1", "postop.aldrete.circulation2"] },
  { key: "aldreteConsciousness", labelKey: "postop.consciousness", scoreKeys: ["postop.aldrete.consciousness0", "postop.aldrete.consciousness1", "postop.aldrete.consciousness2"] },
  { key: "aldreteSpO2", labelKey: "postop.spO2", scoreKeys: ["postop.aldrete.spO20", "postop.aldrete.spO21", "postop.aldrete.spO22"] },
]

export function RecoveryScore({ control, isPediatric, suggestions, total, max, status, onScoreChange }: {
  control: Control<PostopData>
  isPediatric: boolean
  suggestions: Partial<Record<AldreteKey, Suggestion>>
  total: number | null
  max: number
  status: "ready" | "observe" | "unsafe" | "not_ready" | null
  onScoreChange?: () => void
}) {
  const t = useTranslations()
  const criteria = isPediatric ? STEWARD_CRITERIA : ALDRETE_CRITERIA
  const color = status === null ? "outline" : status === "ready" ? "default" : status === "observe" ? "secondary" : "destructive"
  return (
    <div id="postop-sec-score" data-tour="postop-aldrete" className="scroll-mt-28">
      <SectionCard title={t(isPediatric ? "postop.stewardSection" : "postop.aldreteSection")} readiness="recovery" required>
        <div className="space-y-5">
          {criteria.map(({ key, labelKey, scoreKeys }) => <Controller key={key} name={key} control={control} render={({ field }) => {
            const suggestion = suggestions[key as AldreteKey]
            return <div><p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t(labelKey)} <span className="text-red-500">*</span></p><div className="grid grid-cols-3 gap-2">{scoreKeys.map((sk, i) => { const selected = Number(field.value) === i && field.value != null; return <button key={i} type="button" onClick={() => { field.onChange(selected ? null : i); onScoreChange?.() }} className={`rounded-xl border-2 p-2.5 text-center transition-all ${selected ? SCORE_COLORS[i] + " scale-105 shadow-sm" : UNSELECTED} ${suggestion?.score === i && !selected ? "ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-[#111]" : ""}`}><div className="text-xl font-bold leading-none">{i}</div><div className="text-[10px] mt-1 leading-tight opacity-90">{String(t(sk)).replace(/^\d+\s*[—–-]\s*/, "")}</div></button> })}</div>{suggestion && (field.value == null || Number(field.value) !== suggestion.score) ? <div className="mt-1.5 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300" data-testid={`suggest-${key}`}><span>{suggestion.text}</span><button type="button" onClick={() => { field.onChange(suggestion.score); onScoreChange?.() }} className="rounded-full border border-blue-300 px-2 py-0.5 font-semibold hover:bg-blue-50 dark:border-blue-700 dark:hover:bg-blue-950/40">{t("postop.suggest.use")}</button></div> : null}</div>
          }} />)}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-[#2a2a2a]"><span className="font-semibold text-slate-700 dark:text-slate-200">{t(isPediatric ? "postop.stewardTotal" : "postop.aldreteTotal")}:</span><Badge variant={color} className="text-base px-3 py-1" data-testid={isPediatric ? "steward-total" : "aldrete-total"}>{total ?? "—"} / {max}</Badge>{status === "ready" && <span className="text-sm text-green-600 dark:text-green-400">{t("postop.aldreteReady")}</span>}{status !== null && status !== "ready" && <span className="text-sm text-amber-600 dark:text-amber-400">{t("postop.aldreteMonitor")}</span>}</div>
        </div>
      </SectionCard>
    </div>
  )
}
