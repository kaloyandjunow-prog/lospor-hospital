"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useLocale, useTranslations } from "next-intl"
import { X } from "lucide-react"
import {
  accessEventLabels,
  cardEventOps,
  cardSuggestionTag,
  dantroleneCardVials,
  dantroleneDosesMg,
  resolveCard,
  stopRowTargets,
  suggestionCardFor,
  type ResolvedCard,
  type ResolvedRow,
  type SuggestionContext,
} from "@lospor/core/intraop-suggestions"
import { intraopAttentionText } from "@lospor/core/intraop-attention"
import { resolveIntraopEventLabel } from "@lospor/core/clinical-display"
import { clinicalDisplayLabel } from "@lospor/core/display"
import type { LogEvent } from "@lospor/core/intraop-types"
import type { WebIntraopAttention } from "@/lib/use-intraop-attention"
import { SuggestionCardPanel, type SuggestionRowRequest } from "./SuggestionCardPanel"
import { ContextLinkPanel } from "./ContextLinkPanel"

/**
 * What the chart offers a suggestion (10.2.0): its own sheets, prefilled.
 * Built by the timetable, which owns them; the host only asks.
 */
export type SuggestionSheets = {
  nowIso: () => string
  timeOf: (iso: string) => string
  openDrug: (args: { name: string; mode: "bolus" | "infusion"; rect: DOMRect; host?: HTMLElement | null; amount: number | "catalogue" | null; unit?: string; route?: string; suggestion: string }) => void
  openFluid: (args: { name?: string; category?: string; rect: DOMRect; host?: HTMLElement | null; amount: number | "catalogue" | null; mode?: "VOLUME" | "RATE"; concentration?: string; suggestion: string }) => void
  openShock: (suggestion: string) => void
  openLab: () => void
  openGas: (rect: DOMRect, fio2: number, fgf: number, air: boolean, suggestion: string) => void
  /** The running agents and infusions a "Deepen anaesthesia" row can turn up, each opening its own change sheet. */
  deepenTargets: () => { key: string; label: string; open: (rect: DOMRect) => void }[]
  stop: (event: LogEvent, suggestion: string) => void
  displayName: (event: LogEvent) => string
  /** A line failure: the lines of that kind, to say which one failed (10.2.0). */
  linesOf?: (access: "VENOUS" | "ARTERIAL" | "CENTRAL") => { id: string; label: string; failed: boolean }[]
  markLineFailed?: (id: string, at: string) => void
  /** Reintubation and the airway rescues: the airway picker, embedded. */
  openAirway?: (rect: DOMRect, complication: LogEvent) => void
}

type Mini = { key: string; rect: DOMRect; kind: "deepen" | "access"; row: ResolvedRow; complication: LogEvent }

export function SuggestionHost({ attention, sheets }: { attention: WebIntraopAttention; sheets: SuggestionSheets }) {
  const t = useTranslations("intraop.suggestions")
  const locale = useLocale()
  const bg = locale === "bg"
  const [miniState, setMini] = useState<Mini | null>(null)
  const { opened, open, entries, log, suggestions } = attention
  // A small picker belongs to the line it was opened from.
  const mini = miniState && miniState.key === opened ? miniState : null
  const entry = opened ? entries.find(item => item.key === opened) ?? null : null

  // A card stays open after its rows are charted (it leaves the waiting list
  // then), so it is resolved from the log by its complication, not the list.
  const card = useMemo<{ card: ResolvedCard; complication: LogEvent } | null>(() => {
    if (!opened?.startsWith("card:") || !suggestions) return null
    const complication = log.find(event => event.id === opened.slice(5) && event.type === "complication")
    const def = complication ? suggestionCardFor(complication.label) : undefined
    if (!complication || !def) return null
    return {
      card: resolveCard(def, { log, patient: suggestions.patient, preop: suggestions.preop, complication, tofMonitor: suggestions.tofMonitor, now: suggestions.now }),
      complication,
    }
  }, [opened, log, suggestions])

  // A follow-up that belongs to a card, with no dose of its own, opens that card.
  const timer = entry?.suggestion?.item.type === "timer" ? entry.suggestion.item.timer : null
  useEffect(() => {
    if (timer && !timer.dose && timer.complicationEventId && !timer.site) open(`card:${timer.complicationEventId}`)
  }, [timer, open])

  if (!opened || !suggestions) return null
  const close = () => open(null)

  function onRow({ row, rect, complication, host }: SuggestionRowRequest) {
    const tag = cardSuggestionTag(complication.label ?? "", row.id)
    const prefill = row.prefill
    switch (row.def.kind) {
      case "drug": if (prefill?.drug) sheets.openDrug({ name: prefill.drug, mode: "bolus", rect, host, amount: prefill.amount, unit: prefill.unit, route: prefill.route, suggestion: tag }); return
      case "infusion": if (prefill?.drug) sheets.openDrug({ name: prefill.drug, mode: "infusion", rect, host, amount: prefill.amount, unit: prefill.unit, suggestion: tag }); return
      case "fluid": sheets.openFluid({ name: prefill?.fluid, category: prefill?.category, rect, host, amount: prefill?.amount ?? null, mode: prefill?.mode, concentration: prefill?.concentration, suggestion: tag }); return
      case "gas": sheets.openGas(rect, row.def.fio2, row.def.fgf, !!row.def.stopNitrous, tag); return
      case "shock": sheets.openShock(tag); return
      case "lab": sheets.openLab(); return
      case "airway": sheets.openAirway?.(rect, complication); return
      case "deepen": setMini({ key: opened!, rect, kind: "deepen", row, complication }); return
      case "access": setMini({ key: opened!, rect, kind: "access", row, complication }); return
    }
  }

  const miniPanel = mini && (
    <div data-testid={`suggestion-mini-${mini.kind}`}
      style={{ top: Math.min(mini.rect.bottom + 4, (typeof window !== "undefined" ? window.innerHeight : 800) - 200), left: Math.max(8, mini.rect.left - 220) }}
      className="fixed z-[90] w-64 rounded-lg border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1b1b1b] shadow-xl p-2 space-y-1">
      {mini.kind === "deepen" && (() => {
        const targets = sheets.deepenTargets()
        if (targets.length === 0) return <p className="text-xs text-slate-500">{t("deepenNothing")}</p>
        return targets.map(target => (
          <button key={target.key} type="button" className="block w-full text-left text-sm px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={event => { target.open(event.currentTarget.getBoundingClientRect()); setMini(null) }}>
            {target.label}
          </button>
        ))
      })()}
      {mini.kind === "access" && mini.row.def.kind === "access" && (() => {
        const access = mini.row.def.access
        const lines = sheets.linesOf?.(access).filter(line => !line.failed) ?? []
        const at = sheets.nowIso()
        return (
          <>
            {lines.length > 0 && <p className="text-xs font-semibold text-slate-500">{t("whichFailed")}</p>}
            {lines.map(line => (
              <button key={line.id} type="button" data-testid={`suggestion-line-failed-${line.id}`}
                className="block w-full text-left text-sm px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => sheets.markLineFailed?.(line.id, at)}>
                {t("markFailed")} · {line.label}
              </button>
            ))}
            <p className="text-xs font-semibold text-slate-500 pt-1">{t("newLine")}</p>
            {accessEventLabels(access).map(label => (
              <button key={label} type="button" data-testid={`suggestion-new-line-${label}`}
                className="block w-full text-left text-sm px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => { attention.applyOps(cardEventOps(mini.complication, label, mini.row.id, at, at)); setMini(null) }}>
                {resolveIntraopEventLabel(label, bg ? "bg" : "en")}
              </button>
            ))}
          </>
        )
      })()}
    </div>
  )

  if (card) {
    const context = { log, patient: suggestions.patient, preop: suggestions.preop, complication: card.complication, tofMonitor: suggestions.tofMonitor }
    const panel = (
      <>
        <SuggestionCardPanel
          card={card.card}
          complication={card.complication}
          locale={locale}
          now={() => new Date(sheets.nowIso())}
          timeOf={sheets.timeOf}
          stopTargets={row => stopRowTargets(row, context).map(event => ({ event, label: sheets.displayName(event) }))}
          onRow={onRow}
          onStop={(event, row) => sheets.stop(event, cardSuggestionTag(card.complication.label ?? "", row.id))}
          onOps={attention.applyOps}
          onMinimise={close}
          dantrolene={card.complication.label === "Malignant hyperthermia" ? {
            viewFor: perKg => dantroleneCardVials(log, card.complication, { patient: suggestions.patient, now: suggestions.now, dantroleneVialsMg: suggestions.settings.dantroleneVialsMg }, perKg),
            initialPerKg: dantroleneDosesMg(log, card.complication, suggestions.now).length > 0 ? 1 : 2.5,
            give: (doseMg, rect, row) => sheets.openDrug({ name: "Dantrolene", mode: "bolus", rect, amount: doseMg, unit: "mg", suggestion: cardSuggestionTag(card.complication.label ?? "", row.id) }),
          } : undefined}
          arrest={card.complication.label === "Cardiac arrest" ? { log, patient: suggestions.patient } : undefined}
          readOnly={!attention.canAnswer}
        />
        {miniPanel}
      </>
    )
    // Suggestions are a chart-level overlay, not a child of the timetable
    // grid. Portalling the rail to body prevents a desktop sidebar or a
    // scroll/overflow ancestor from sitting above its controls and stealing
    // clicks from the clinician.
    return typeof document === "undefined" ? null : createPortal(panel, document.body)
  }

  if (!entry?.suggestion) return null
  if (entry.suggestion.item.type === "context") {
    return typeof document === "undefined"
      ? null
      : createPortal(<ContextLinkPanel key={entry.key} entry={entry} attention={attention} sheets={sheets} onClose={close} />, document.body)
  }
  return typeof document === "undefined"
    ? null
    : createPortal(<FollowUpPanel entry={entry} attention={attention} sheets={sheets} context={suggestions} onClose={close} />, document.body)
}

/** A follow-up, reminder or lab suggestion opened from its line: what it says and what it offers. */
function FollowUpPanel({ entry, attention, sheets, context, onClose }: {
  entry: WebIntraopAttention["entries"][number]
  attention: WebIntraopAttention
  sheets: SuggestionSheets
  context: SuggestionContext
  onClose: () => void
}) {
  const t = useTranslations("intraop.suggestions")
  const locale = useLocale()
  const item = entry.suggestion!.item
  const tag = `${item.type}:${entry.key}`
  const button = "pointer-events-auto text-sm px-3 py-1.5 rounded-full border border-emerald-400 text-emerald-700 dark:text-emerald-300"
  const drug = (name: string, amount: number | "catalogue" | null = "catalogue", unit?: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
    sheets.openDrug({ name, mode: "bolus", rect: event.currentTarget.getBoundingClientRect(), amount, unit, suggestion: tag })
    onClose()
  }
  const lang = locale === "bg" ? "bg" : "en"
  const name = (label: string) => clinicalDisplayLabel("option:INTRAOP_DRUG", label, lang, { label })
  const fluidName = (label: string) => clinicalDisplayLabel("option:INTRAOP_FLUID", label, lang, { label })
  const offers: React.ReactNode[] = []
  if (item.type === "timer") {
    const dose = item.timer.dose
    if (dose?.drug) {
      offers.push(<button key="give" type="button" className={button} data-testid="follow-up-give" onClick={drug(dose.drug, dose.amount, dose.unit)}>{t("give")}</button>)
    } else if (dose?.fluid) {
      offers.push(<button key="give" type="button" className={button} data-testid="follow-up-give"
        onClick={event => { sheets.openFluid({ name: dose.fluid, rect: event.currentTarget.getBoundingClientRect(), amount: dose.amount, mode: dose.mode, suggestion: tag }); onClose() }}>{t("give")}</button>)
    }
    if (item.timer.site != null || item.timer.kind.startsWith("tourniquet")) {
      offers.push(<button key="off" type="button" className={button} data-testid="follow-up-tourniquet-off"
        onClick={() => {
          const at = sheets.nowIso()
          attention.applyOps({ add: [{ id: `sg-tourniquet-off-${Date.parse(at)}`, ts: at, type: "clinical_event", label: "Tourniquet off", ...(item.timer.site ? { site: item.timer.site } : {}), suggestion: tag, recordedAt: at }], update: [], remove: [] })
          onClose()
        }}>{t("tourniquetOff")}</button>)
    }
  } else if (item.type === "reminder") {
    if (item.reminder.kind === "ponv") offers.push(<button key="ponv" type="button" className={button} onClick={drug("Ondansetron")}>{t("give")}</button>)
    else offers.push(<button key="lab" type="button" className={button} onClick={() => { sheets.openLab(); onClose() }}>{t("open")}</button>)
  } else if (item.type === "lab") {
    offers.push(<button key="fib" type="button" className={button} onClick={drug("Fibrinogen concentrate")}>{name("Fibrinogen concentrate")}</button>)
    offers.push(<button key="cryo" type="button" className={button}
      onClick={event => { sheets.openFluid({ name: "Cryoprecipitate", rect: event.currentTarget.getBoundingClientRect(), amount: "catalogue", suggestion: tag }); onClose() }}>
      {fluidName("Cryoprecipitate")}
    </button>)
  } else if (item.type === "reading") {
    offers.push(<button key="sug" type="button" className={button} onClick={drug("Sugammadex")}>{name("Sugammadex")}</button>)
    offers.push(<button key="neo" type="button" className={button} onClick={drug("Neostigmine")}>{name("Neostigmine")}</button>)
  }
  void context
  return (
    <aside role="dialog" aria-modal="false" data-testid="suggestion-follow-up"
      className="pointer-events-none fixed right-4 top-24 z-[80] w-[min(24rem,calc(100%-2rem))] rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#161616] shadow-2xl p-3 space-y-3">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm font-semibold break-words">
          {entry.time ? `${entry.time} · ` : ""}{intraopAttentionText(entry, locale)}
        </p>
        <button type="button" style={{ pointerEvents: "auto" }} onClick={onClose} aria-label={t("minimise")} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex flex-wrap gap-2">{offers}</div>
      <div className="flex justify-end">
        <button type="button" style={{ pointerEvents: "auto" }} data-testid="follow-up-not-now" disabled={!attention.canAnswer}
          onClick={() => { attention.answer(entry.key, "not_now"); onClose() }}
          className="text-xs px-3 py-1.5 rounded-full border border-red-300 text-red-500">{t("notNow")}</button>
      </div>
    </aside>
  )
}
