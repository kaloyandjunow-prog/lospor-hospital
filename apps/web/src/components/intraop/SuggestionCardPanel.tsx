"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { X, Minus, Check } from "lucide-react"
import {
  cardAlsoLogOps,
  cardCloseOps,
  cardEventOps,
  cardQuestionOps,
  cardRelabelOps,
  cardResolveOps,
  say,
  type ResolvedCard,
  type ResolvedRow,
} from "@lospor/core/intraop-suggestions"
import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import type { LogEvent } from "@lospor/core/intraop-types"
import { clinicalDisplayLabel } from "@lospor/core/display"
import type { DantroleneVialsView } from "@lospor/core/intraop-suggestions"
import { arrestQuickDoseOps, arrestRespaceOps, cardSuggestionTag, type ArrestDrug, type SuggestionPatient } from "@lospor/core/intraop-suggestions"
import { DantroleneVials } from "./DantroleneVials"

/**
 * The follow-up card or next-steps checklist after a complication (10.2.0),
 * beside the chart. Core resolves the rows for this patient and this log
 * (intraop-suggestions); the panel only lays them out. A drug, infusion or
 * fluid row opens the chart's own dosing sheet prefilled, so the dose can
 * still be slid, picked from the quick values or typed; the questions, the
 * relabel and the events write Core's operations directly. Nothing is charted
 * without a tap, and ✕ minimises a card to its line in the waiting list.
 */

/** What a row asks of the chart: its sheets, the shock dial, the labs. */
/** `host` is the empty slot under the row, where its dosing controls open in place. */
export type SuggestionRowRequest = { row: ResolvedRow; rect: DOMRect; complication: LogEvent; host: HTMLElement | null }

export function SuggestionCardPanel({
  card,
  complication,
  locale,
  now,
  timeOf,
  stopTargets,
  onRow,
  onStop,
  onOps,
  onMinimise,
  dantrolene,
  arrest,
  readOnly = false,
}: {
  card: ResolvedCard
  complication: LogEvent
  locale: string
  /** Server-corrected now, for the red strip and the times written. */
  now: () => Date
  /** An instant as the case's own wall clock, "14:05". */
  timeOf: (iso: string) => string
  /** The running items each stop row would stop. */
  stopTargets: (row: ResolvedRow) => { event: LogEvent; label: string }[]
  onRow: (request: SuggestionRowRequest) => void
  onStop: (target: LogEvent, row: ResolvedRow) => void
  onOps: (ops: IntraopEventOps) => void
  onMinimise: () => void
  /** The MH card's vials (10.2.0): the plan for a dose in mg/kg, and Give. */
  dantrolene?: { viewFor: (perKg: number) => DantroleneVialsView | null; initialPerKg: number; give: (doseMg: number, rect: DOMRect, row: ResolvedRow) => void }
  /** Cardiac arrest (10.2.0): the log and patient, so Give writes a dose at once and ROSC / Death spread them. */
  arrest?: { log: LogEvent[]; patient: SuggestionPatient }
  readOnly?: boolean
}) {
  const t = useTranslations("intraop.suggestions")
  const bg = locale === "bg"
  const [branch, setBranch] = useState<string | null>(null)
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [resolveTime, setResolveTime] = useState("")
  const [eventTimes, setEventTimes] = useState<Record<string, string>>({})
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!card.redStrip) return
    const timer = setInterval(() => setTick(value => value + 1), 15_000)
    return () => clearInterval(timer)
  }, [card.redStrip])

  const rows = useMemo(
    () => card.rows.filter(row => !row.branches || (branch != null && row.branches.includes(branch))),
    [card.rows, branch],
  )
  const minutes = Math.max(0, Math.floor((now().getTime() - Date.parse(card.onset)) / 60_000))
  const name = clinicalDisplayLabel("complication", card.complication, bg ? "bg" : "en", { label: card.complication })
  const complicationName = (label: string) => clinicalDisplayLabel("complication", label, bg ? "bg" : "en", { label })
  const write = (ops: IntraopEventOps) => { if (!readOnly) onOps(ops) }
  const arrestDrugOf = (row: ResolvedRow): ArrestDrug | null => arrest && row.def.kind === "drug"
    && (row.def.drug === "Epinephrine / Adrenaline" || row.def.drug === "Amiodarone") ? row.def.drug : null
  function writeEvent(row: ResolvedRow, label: string, at: string) {
    const ops = cardEventOps(complication, label, row.id, at, nowIso())
    if (!arrest || (label !== "ROSC" && label !== "Death (exitus letalis)")) { write(ops); return }
    write({ add: ops.add, update: arrestRespaceOps(arrest.log, complication, at).update, remove: [] })
  }
  const nowIso = () => now().toISOString()

  /** "14:05" typed against the onset's day, in the case's wall clock: the instant, or null. */
  function typedInstant(value: string): string | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
    if (!match) return null
    const onset = new Date(card.onset)
    const local = new Date(onset)
    local.setHours(Number(match[1]), Number(match[2]), 0, 0)
    // Typed in the screen's clock; the onset's own offset carries it to the case's instant.
    return Number.isFinite(local.getTime()) ? local.toISOString() : null
  }

  function rowBody(row: ResolvedRow) {
    const def = row.def
    switch (def.kind) {
      case "relabel":
        return (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {def.choices.map(choice => (
              <button key={choice} type="button" style={{ pointerEvents: "auto" }} disabled={readOnly} data-testid={`card-relabel-${choice}`}
                onClick={() => write(cardRelabelOps(complication, choice, row.id))}
                className="text-xs px-2.5 py-1 rounded-full border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
                {complicationName(choice)}
              </button>
            ))}
          </div>
        )
      case "alsoLog":
        return (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {def.complications.map(choice => (
              <button key={choice} type="button" style={{ pointerEvents: "auto" }} disabled={readOnly || !!row.used} data-testid={`card-also-${choice}`}
                onClick={() => write(cardAlsoLogOps(complication, choice, row.id, nowIso()))}
                className="text-xs px-2.5 py-1 rounded-full border border-red-300 text-red-600 dark:text-red-300 disabled:opacity-50">
                {complicationName(choice)}
              </button>
            ))}
          </div>
        )
      case "question":
        return (
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs text-slate-600 dark:text-slate-300">{say(def.prompt, locale)}</span>
            <button type="button" style={{ pointerEvents: "auto" }} disabled={readOnly || !!row.used} data-testid={`card-question-${row.id}`}
              onClick={() => write(cardQuestionOps(complication, row.id, def.reveals, def.logs, nowIso()))}
              className="text-xs px-2.5 py-1 rounded-full border border-emerald-400 text-emerald-600 disabled:opacity-50">
              {t("yes")}
            </button>
          </div>
        )
      case "resolve":
        return (
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <button type="button" style={{ pointerEvents: "auto" }} disabled={readOnly} data-testid="card-resolve-now"
              onClick={() => write(cardResolveOps(complication, nowIso()))}
              className="text-xs px-2.5 py-1 rounded-full border border-emerald-400 text-emerald-600">
              {t("now")}
            </button>
            <input style={{ pointerEvents: "auto" }} value={resolveTime} onChange={event => setResolveTime(event.target.value)} placeholder="hh:mm" inputMode="numeric"
              aria-label={t("atTime")} data-testid="card-resolve-time"
              className="w-20 text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-transparent" />
            <button type="button" style={{ pointerEvents: "auto" }} disabled={readOnly || typedInstant(resolveTime) == null}
              onClick={() => { const at = typedInstant(resolveTime); if (at) write(cardResolveOps(complication, at)) }}
              className="text-xs px-2.5 py-1 rounded-full border border-slate-300 dark:border-slate-600 disabled:opacity-50">
              {t("atTime")}
            </button>
          </div>
        )
      case "event": {
        // Now, or the time it really happened: an arrest is often charted afterwards.
        const typed = eventTimes[row.id] ?? ""
        return (
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <button type="button" style={{ pointerEvents: "auto" }} disabled={readOnly} data-testid={`card-event-${row.id}`}
              onClick={() => writeEvent(row, def.label, nowIso())}
              className="text-xs px-2.5 py-1 rounded-full border border-emerald-400 text-emerald-600">
              {t("now")}
            </button>
            <input style={{ pointerEvents: "auto" }} value={typed} onChange={event => setEventTimes(prev => ({ ...prev, [row.id]: event.target.value }))} placeholder="hh:mm" inputMode="numeric"
              aria-label={t("atTime")} data-testid={`card-event-time-${row.id}`}
              className="w-20 text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-transparent" />
            <button type="button" style={{ pointerEvents: "auto" }} disabled={readOnly || typedInstant(typed) == null} data-testid={`card-event-at-${row.id}`}
              onClick={() => { const at = typedInstant(typed); if (at) writeEvent(row, def.label, at) }}
              className="text-xs px-2.5 py-1 rounded-full border border-slate-300 dark:border-slate-600 disabled:opacity-50">
              {t("atTime")}
            </button>
          </div>
        )
      }
      case "openCard":
        return (
          <button type="button" style={{ pointerEvents: "auto" }} disabled={readOnly || !!row.used} data-testid={`card-open-${def.complication}`}
            onClick={() => write(cardAlsoLogOps(complication, def.complication, row.id, nowIso()))}
            className="mt-1 text-xs px-2.5 py-1 rounded-full border border-slate-300 dark:border-slate-600 disabled:opacity-50">
            {t("openCard")}
          </button>
        )
      case "stop": {
        const targets = stopTargets(row)
        if (targets.length === 0) return <p className="text-xs text-slate-500 mt-1">{t("nothingRunning")}</p>
        return (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {targets.map(target => (
              <button key={target.event.id} type="button" style={{ pointerEvents: "auto" }} disabled={readOnly} data-testid={`card-stop-${target.event.id}`}
                onClick={() => onStop(target.event, row)}
                className="text-xs px-2.5 py-1 rounded-full border border-red-300 text-red-600 dark:text-red-300">
                {t("stop")} · {target.label}
              </button>
            ))}
          </div>
        )
      }
      case "memory":
        return (
          <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
            {def.items.map((item, index) => {
              const key = `${row.id}-${index}`
              return (
                <li key={key}>
                  <label style={{ pointerEvents: "auto" }} className="flex items-center gap-1.5 text-xs">
                    <input style={{ pointerEvents: "auto" }} type="checkbox" checked={!!ticked[key]} onChange={event => setTicked(prev => ({ ...prev, [key]: event.target.checked }))} />
                    {say(item, locale)}
                  </label>
                </li>
              )
            })}
          </ul>
        )
      default:
        return null
    }
  }

  /** Rows that open a sheet or a dialog of the chart's own: the whole row is the button. */
  const opensSheet = (row: ResolvedRow) =>
    ["drug", "infusion", "fluid", "gas", "shock", "lab", "deepen", "access", "airway"].includes(row.kind)

  function prefillText(row: ResolvedRow): string | null {
    const prefill = row.prefill
    if (!prefill) return null
    if (prefill.amount === "catalogue") return null
    if (prefill.amount == null) return t("noDose")
    return `${prefill.amount} ${prefill.unit ?? ""}`.trim()
  }

  return (
    <aside
      role="dialog"
      aria-label={name}
      aria-modal="false"
      data-testid="suggestion-card"
      className="pointer-events-none fixed right-4 top-24 z-[80] w-[min(26rem,calc(100%-2rem))] max-h-[calc(100vh-8rem)] overflow-y-auto rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#161616] shadow-2xl"
    >
      {card.redStrip && (
        <div className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-t-xl" data-testid="suggestion-card-strip">
          {t("sinceOnset", { minutes })}
        </div>
      )}
      <div className="flex items-start gap-2 px-3 pt-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold break-words">{name}</p>
          <p className="text-xs text-slate-500">
            {timeOf(card.onset)}{card.question ? ` · ${say(card.question, locale)}` : ""}
          </p>
        </div>
        <button type="button" style={{ pointerEvents: "auto" }} onClick={onMinimise} aria-label={t("minimise")} data-testid="suggestion-card-minimise"
          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
          {card.kind === "checklist" ? <Minus className="w-4 h-4" /> : <X className="w-4 h-4" />}
        </button>
      </div>
      {card.branches && (
        <div className="px-3 pt-2">
          {card.branches.prompt && <p className="text-xs text-slate-500 mb-1">{say(card.branches.prompt, locale)}</p>}
          <div className="flex flex-wrap gap-1.5">
            {card.branches.options.map(option => (
              <button key={option.id} type="button" style={{ pointerEvents: "auto" }} data-testid={`card-branch-${option.id}`}
                onClick={() => setBranch(option.id)}
                className={`text-xs px-2.5 py-1 rounded-full border ${branch === option.id
                  ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
                  : "border-slate-300 dark:border-slate-600"}`}>
                {say(option.title, locale)}
              </button>
            ))}
          </div>
        </div>
      )}
      <ol className="px-3 py-2 space-y-1.5">
        {rows.map(row => {
          const used = row.used
          const prefill = prefillText(row)
          const head = (
            <span className="flex items-start gap-2 w-full text-left">
              <span className={`mt-0.5 w-4 h-4 shrink-0 rounded-full border flex items-center justify-center ${used ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 dark:border-slate-600"}`}>
                {used && <Check className="w-3 h-3" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm break-words">{say(row.title, locale)}</span>
                {(prefill || row.step || row.total) && (
                  <span className="block text-xs text-slate-500">
                    {[prefill,
                      row.step ? t("step", { index: row.step.index + 1, of: row.step.of }) : null,
                      row.total ? t("total", { amount: row.total.amount, max: row.total.max, unit: row.total.unit }) : null,
                    ].filter(Boolean).join(" · ")}
                  </span>
                )}
                {used && (
                  <span className="block text-xs text-emerald-600 dark:text-emerald-400" data-testid={`card-used-${row.id}`}>
                    ✓ {[used.lastAmount ? `${used.lastAmount} ${used.lastUnit ?? ""}`.trim() : null, timeOf(used.lastTs), used.count > 1 ? `×${used.count}` : null].filter(Boolean).join(" · ")}
                  </span>
                )}
                {row.note && <span className="block text-xs text-slate-500 italic">{say(row.note, locale)}</span>}
              </span>
            </span>
          )
          return (
            <li key={row.id} data-testid={`card-row-${row.id}`} className="rounded-lg border border-slate-100 dark:border-[#262626] px-2 py-1.5">
              {opensSheet(row) && !arrestDrugOf(row) ? (
                <button type="button" style={{ pointerEvents: "auto" }} disabled={readOnly} className="w-full disabled:opacity-60"
                  onClick={event => onRow({ row, rect: event.currentTarget.getBoundingClientRect(), complication, host: event.currentTarget.closest("li")?.querySelector<HTMLElement>("[data-row-host]") ?? null })}>
                  {head}
                </button>
              ) : head}
              {rowBody(row)}
              {arrestDrugOf(row) && arrest ? (
                <button type="button" style={{ pointerEvents: "auto" }} disabled={readOnly} data-testid={`card-arrest-give-${row.id}`}
                  onClick={() => write(arrestQuickDoseOps(arrest.log, complication, arrestDrugOf(row)!, arrest.patient, nowIso(), cardSuggestionTag(complication.label ?? "", row.id)))}
                  className="mt-1 text-xs px-2.5 py-1 rounded-full border border-emerald-400 text-emerald-600">
                  {t("give")}
                </button>
              ) : null}
              {/* Where this row's own dosing controls open, in place: the card never changes screen. */}
              <div data-row-host={row.id} data-testid={`card-host-${row.id}`} />
              {dantrolene && row.def.kind === "drug" && row.def.drug === "Dantrolene" && (
                <div style={{ pointerEvents: "auto" }}>
                  <DantroleneVials viewFor={dantrolene.viewFor} initialPerKg={dantrolene.initialPerKg} readOnly={readOnly}
                    onGive={(doseMg, rect) => dantrolene.give(doseMg, rect, row)} />
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <div className="flex justify-end gap-2 px-3 pb-3">
        <button type="button" style={{ pointerEvents: "auto" }} disabled={readOnly} data-testid="suggestion-card-not-now"
          onClick={() => { write(cardCloseOps(complication, "not_now", nowIso())); onMinimise() }}
          className="text-xs px-3 py-1.5 rounded-full border border-red-300 text-red-500">
          {t("notNow")}
        </button>
        {card.kind === "checklist" && (
          <button type="button" style={{ pointerEvents: "auto" }} disabled={readOnly} data-testid="suggestion-card-done"
            onClick={() => { write(cardCloseOps(complication, "done", nowIso())); onMinimise() }}
            className="text-xs px-3 py-1.5 rounded-full border border-emerald-400 text-emerald-600">
            {t("done")}
          </button>
        )}
      </div>
    </aside>
  )
}
