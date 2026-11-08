"use client"

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { contextLinkAnswerOps, type ContextLinkAnswer } from "@lospor/core/intraop-suggestions"
import { airwayDeviceEntriesOf, airwayPrimaryConflict, isPrimaryAirwayDevice } from "@lospor/core/airway-device-entries"
import { techniqueHasSide, type TechniqueSide } from "@lospor/core/technique-smart"
import { instantFromDateKey, isValidTimeZone, localDateKey, localTimeOf } from "@lospor/core/intraop-time"
import type { WebIntraopAttention } from "@/lib/use-intraop-attention"
import { type SuggestionSheets } from "./SuggestionHost"

type Step = "route" | "kind" | "technique" | "side" | "airway" | "airway-replacement" | "airway-device"
type TechniqueKind = "sedation" | "general"

export function ContextLinkPanel({ entry, attention, sheets, onClose }: {
  entry: WebIntraopAttention["entries"][number]
  attention: WebIntraopAttention
  sheets: Pick<SuggestionSheets, "nowIso">
  onClose: () => void
}) {
  const t = useTranslations("intraop.suggestions")
  const locale = useLocale() === "bg" ? "bg" : "en"
  const link = entry.suggestion?.item.type === "context" ? entry.suggestion.item.link : null
  const firstStep = link?.kind === "route" ? "route" : link?.kind === "side" ? "side" : link?.kind === "induction" || link?.kind === "airway" ? "kind" : "technique"
  const [step, setStep] = useState<Step>(firstStep)
  const [techniqueKind, setTechniqueKind] = useState<TechniqueKind | null>(null)
  const [technique, setTechnique] = useState<string | null>(null)
  const [replaceArrivalTube, setReplaceArrivalTube] = useState<boolean | null>(null)
  const [timeConfirmed, setTimeConfirmed] = useState(() => link?.startedAt != null)
  const [at, setAt] = useState(() => {
    const instant = new Date(link?.suggestedAt ?? sheets.nowIso())
    const zone = link?.timeZone
    const date = zone && isValidTimeZone(zone) ? localDateKey(instant, zone) : null
    const time = zone && isValidTimeZone(zone) ? localTimeOf(instant, zone) : null
    return date && time ? `${date}T${time}` : instant.toISOString().slice(0, 16)
  })
  const timeIso = useMemo<string | null>(() => {
    if (!at.trim()) return null
    const zone = link?.timeZone
    if (zone && isValidTimeZone(zone)) {
      const [date, time] = at.split("T")
      const parsed = date && time ? instantFromDateKey(date, time, zone) : null
      return parsed?.toISOString() ?? null
    }
    const parsed = new Date(at)
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
  }, [at, link?.timeZone])
  if (!link) return null

  const commit = (answer: ContextLinkAnswer) => {
    const requiresClinicalTime = answer.type === "side"
      || answer.type === "event"
      || answer.type === "technique"
      || answer.type === "induction"
    // Keep the prompt open when a clinical answer still has no defensible
    // timestamp.  Closing it after Core rejected the operation made the
    // suggestion appear to vanish without recording anything.
    if (requiresClinicalTime && (!timeIso || (link.startedAt == null && !timeConfirmed))) return
    attention.applyOps(contextLinkAnswerOps(link, answer, sheets.nowIso()))
    onClose()
  }
  const chooseTechnique = (code: string) => {
    setTechnique(code)
    if (techniqueHasSide(code)) setStep("side")
    else if (link.kind === "induction") setStep("airway")
    else if (link.kind === "technique-event") commit({ type: "event", at: timeIso ?? undefined, timeConfirmed })
    else commit({ type: "technique", code, at: timeIso ?? undefined, timeConfirmed })
  }
  const chooseTechniqueKind = (kind: TechniqueKind) => {
    setTechniqueKind(kind)
    setStep("technique")
  }
  const chooseSide = (value: TechniqueSide) => {
    if (!technique) commit({ type: "side", side: value, at: timeIso ?? undefined, timeConfirmed })
    else if (link.kind === "induction") setStep("airway")
    else commit({ type: "technique", code: technique, side: value, at: timeIso ?? undefined, timeConfirmed })
  }
  const chooseAirway = (value: string | null) => {
    if (value == null && technique) commit({ type: "induction", code: technique, at: timeIso ?? undefined, timeConfirmed, replaceArrivalTube: false })
    else if (value != null) {
      const entries = airwayDeviceEntriesOf({ airwayDevices: link.airwayDevices, airwayDeviceEntries: link.airwayDeviceEntries })
      if ((link.presentsIntubated && isPrimaryAirwayDevice(value)) || airwayPrimaryConflict(entries, value)) {
        setReplaceArrivalTube(null)
        setStep("airway-replacement")
      } else setStep("airway-device")
    }
  }
  const chooseAirwayReplacement = (replace: boolean) => {
    setReplaceArrivalTube(replace)
    if (replace) setStep("airway-device")
    else if (technique) commit({ type: "induction", code: technique, at: timeIso ?? undefined, timeConfirmed, replaceArrivalTube: false })
  }
  const title = locale === "bg" ? link.titleBg : link.titleEn
  const prompt = locale === "bg" ? link.promptBg : link.promptEn
  const label = (choice: { label: string; labelBg: string }) => locale === "bg" ? choice.labelBg : choice.label
  const sideLabel: Record<TechniqueSide, string> = locale === "bg"
    ? { LEFT: "Лява", RIGHT: "Дясна", BOTH: "И двете" }
    : { LEFT: "Left", RIGHT: "Right", BOTH: "Bilateral" }
  const techniqueChoices = link.techniqueChoices.filter(choice => {
    if (!techniqueKind) return true
    return techniqueKind === "sedation" ? choice.value.startsWith("SEDATION_") : choice.value.startsWith("GENERAL_")
  })

  return (
    <div data-testid="context-link-panel" className="fixed inset-x-0 bottom-0 z-[95] mx-auto w-full max-w-2xl rounded-t-2xl border border-slate-300 bg-white p-4 shadow-2xl dark:border-[#444] dark:bg-[#1b1b1b]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{prompt}</p>
        </div>
        <button type="button" className="rounded-full px-2 py-1 text-slate-500" onClick={onClose} aria-label={t("cancel")}>×</button>
      </div>
      {link.startedAt == null && <p data-testid="context-link-missing-start" className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">{t("contextMissingStart")}</p>}
      {!timeIso && <p data-testid="context-link-invalid-time" className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">{t("contextInvalidTime")}</p>}
      {link.kind === "route" && step === "route" && (
        <div className="mt-4 flex gap-2">
          <button type="button" className="rounded-lg border border-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-600" onClick={() => setStep("technique")}>{t("contextYes")}</button>
          <button type="button" className="rounded-lg border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300" onClick={() => commit({ type: "no" })}>{t("contextNo")}</button>
        </div>
      )}
      {link.kind === "extubation" && <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{t("contextReviewAirway")}</p>}
      {link.kind === "extubation" && <button type="button" className="mt-3 rounded-lg border border-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-600" onClick={() => commit({ type: "complete" })}>{t("contextRecord")}</button>}
      {(link.kind === "induction" || link.kind === "airway") && step === "kind" && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("contextChooseKind")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border border-violet-400 px-4 py-2 text-sm font-semibold text-violet-600" onClick={() => chooseTechniqueKind("sedation")}>{t("contextSedation")}</button>
            <button type="button" className="rounded-lg border border-blue-400 px-4 py-2 text-sm font-semibold text-blue-600" onClick={() => chooseTechniqueKind("general")}>{t("contextGeneral")}</button>
          </div>
        </div>
      )}
      {step === "technique" && link.kind !== "extubation" && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("contextChooseTechnique")}</p>
          <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {techniqueChoices.map(choice => <button key={choice.value} type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-left text-sm text-slate-800 hover:border-blue-500 dark:border-[#444] dark:text-slate-100" onClick={() => chooseTechnique(choice.value)}>{label(choice)}</button>)}
          </div>
        </div>
      )}
      {step === "side" && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("contextChooseSide")}</p>
          <div className="flex flex-wrap gap-2">{(["LEFT", "RIGHT", "BOTH"] as TechniqueSide[]).map(value => <button key={value} type="button" className="rounded-lg border border-violet-400 px-4 py-2 text-sm font-semibold text-violet-600" onClick={() => chooseSide(value)}>{sideLabel[value]}</button>)}</div>
        </div>
      )}
      {step === "airway" && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("contextChooseAirway")}</p>
          <div className="flex gap-2"><button type="button" className="rounded-lg border border-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-600" onClick={() => chooseAirway("")}>{t("contextYes")}</button><button type="button" className="rounded-lg border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300" onClick={() => chooseAirway(null)}>{t("contextNo")}</button></div>
        </div>
      )}
      {step === "airway-replacement" && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{link.presentsIntubated ? t("contextReplaceArrival") : t("contextReplaceRecorded")}</p>
          <div className="flex gap-2"><button type="button" className="rounded-lg border border-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-600" onClick={() => chooseAirwayReplacement(true)}>{t("contextYes")}</button><button type="button" className="rounded-lg border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300" onClick={() => chooseAirwayReplacement(false)}>{t("contextNo")}</button></div>
        </div>
      )}
      {step === "airway-device" && (
        <div className="mt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("contextChooseAirway")}</p><div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto">{link.airwayChoices.map(choice => <button key={choice.value} type="button" className="rounded-lg border border-indigo-400 px-3 py-2 text-left text-sm text-indigo-700 dark:text-indigo-200" onClick={() => commit({ type: "induction", code: technique!, airwayDevice: choice.value, at: timeIso ?? undefined, timeConfirmed, ...(replaceArrivalTube === true ? { replaceArrivalTube: true } : {}) })}>{label(choice)}</button>)}</div></div>
      )}
      <label className="mt-4 block text-xs text-slate-500">{t("contextTime")}<input type="datetime-local" value={at} onChange={event => { setAt(event.target.value); setTimeConfirmed(true) }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-[#444]" /></label>
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-[#333]">
        <button type="button" className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600" onClick={() => { attention.answer(entry.key, "dismiss"); onClose() }}>{t("dismiss")}</button>
      </div>
    </div>
  )
}
