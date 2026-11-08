"use client"

import { useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { automationEnabled, automationGroupEnabled } from "@lospor/core/intraop-automation"
import {
  latexBanner,
  localAnaestheticBudgetText,
  localAnaestheticCheck,
  mhHistoryWarning,
  MH_HISTORY_WARNING,
  REMINDER_IDS,
  type SuggestionContext,
} from "@lospor/core/intraop-suggestions"
import type { LogEvent } from "@lospor/core/intraop-types"

type Dose = { name: string; dose?: string; unit?: string; route?: string; concentration?: string; atcCode?: string }
type Agent = { name: string; startCol: number }
type Chart = { drugs: Dose[]; agents?: Agent[] }

export type GateWarning = { kind: "mh"; name: string } | { kind: "laMax"; name: string; text: string | null }

/**
 * What a chart change adds that needs a word first (10.2.0): a volatile or
 * suxamethonium for a patient with an MH history on the preop record (P1),
 * and a local anaesthetic bolus that goes over the patient's maximum (E2).
 * New doses are the ones not in the chart before (by identity, as the allergy
 * gate counts them); a new agent is a name and start not there before.
 */
export function newGateWarnings(context: Omit<SuggestionContext, "now">, log: LogEvent[], prev: Chart, next: Chart, now: string, locale: string): GateWarning[] {
  const warnings: GateWarning[] = []
  // Each warning is its own automation: Status may switch one off and keep the rest.
  const mhOn = automationEnabled(context.settings, "reminders", REMINDER_IDS.mhHistory, context.user)
  const laOn = automationEnabled(context.settings, "reminders", REMINDER_IDS.localAnaestheticMax, context.user)
  const before = new Set(prev.drugs)
  const added = next.drugs.filter(dose => !before.has(dose))
  const agentsBefore = new Set((prev.agents ?? []).map(agent => `${agent.name}@${agent.startCol}`))
  const newAgents = (next.agents ?? []).filter(agent => !agentsBefore.has(`${agent.name}@${agent.startCol}`))
  for (const agent of newAgents) {
    if (mhOn && mhHistoryWarning(context.preop, { type: "agent_start", name: agent.name })) warnings.push({ kind: "mh", name: agent.name })
  }
  for (const dose of added) {
    if (mhOn && mhHistoryWarning(context.preop, { type: "drug", name: dose.name, atcCode: dose.atcCode })) warnings.push({ kind: "mh", name: dose.name })
    const event: LogEvent = { id: "pending", ts: now, type: "drug", name: dose.name, dose: dose.dose, unit: dose.unit, drugRoute: dose.route, concentration: dose.concentration }
    const check = laOn ? localAnaestheticCheck(log, context.patient, event) : null
    if (check?.wouldExceed) warnings.push({ kind: "laMax", name: dose.name, text: localAnaestheticBudgetText(check, dose.name, locale) })
  }
  return warnings
}

export function useSuggestionGate({ context, log, locale, now, ready = true }: {
  context: Omit<SuggestionContext, "now"> | null
  log: LogEvent[]
  locale: string
  now: () => string
  ready?: boolean
}): {
  guard: <T extends Chart>(prev: T, apply: (next: T) => void) => (next: T) => void
  modal: ReactNode
  banner: ReactNode
} {
  const t = useTranslations("intraop.suggestions")
  const [pending, setPending] = useState<{ warnings: GateWarning[]; confirm: () => void } | null>(null)
  const on = !!context && automationGroupEnabled(context.settings, "reminders", context.user)

  function guard<T extends Chart>(prev: T, apply: (next: T) => void) {
    return (next: T) => {
      if (!ready || !on || !context) return apply(next)
      const warnings = newGateWarnings(context, log, prev, next, now(), locale)
      if (warnings.length === 0) return apply(next)
      setPending({ warnings, confirm: () => apply(next) })
    }
  }

  const bg = locale === "bg"
  const modal = pending ? (
    <div role="alertdialog" aria-label={t("laMaxTitle")} data-testid="suggestion-gate" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-2xl dark:bg-[#1e1e1e]">
        <ul className="space-y-2">
          {pending.warnings.map(warning => (
            <li key={`${warning.kind}-${warning.name}`} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-200">
              <strong>{warning.kind === "mh" ? "⚠ MH" : `⚠ ${t("laMaxTitle")}`}</strong>
              <span className="block">{warning.kind === "mh" ? MH_HISTORY_WARNING[bg ? "bg" : "en"] : t("laMaxExceeds")}</span>
              {warning.kind === "laMax" && warning.text && <span className="block text-xs" data-testid="suggestion-gate-budget">{warning.text}</span>}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPending(null)}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">
            {t("cancel")}
          </button>
          <button type="button" data-testid="suggestion-gate-give" onClick={() => { pending.confirm(); setPending(null) }}
            className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700">
            {t("mhGive")}
          </button>
        </div>
      </div>
    </div>
  ) : null

  const latex = on && context && automationEnabled(context.settings, "reminders", REMINDER_IDS.latex, context.user) ? latexBanner(context.preop, locale) : null
  const banner = latex ? (
    <div role="status" data-testid="latex-banner" className="mb-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-800 dark:border-rose-500/50 dark:bg-rose-950/40 dark:text-rose-200">
      ⚠ {latex}
    </div>
  ) : null

  return { guard, modal, banner }
}
