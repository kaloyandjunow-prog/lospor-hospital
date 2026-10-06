"use client"

import { useState, type ReactNode } from "react"
import {
  allergyConflicts,
  allergyRecords,
  type AllergyConflict,
  type AllergyMatchLevel,
} from "@lospor/core/allergy-drug-check"
import type { AllergyAck } from "@lospor/core/intraop-types"

type Dose = { name: string; atcCode?: string; inn?: string; allergyAck?: AllergyAck[] }
type Chart = { drugs: Dose[]; infusions?: Dose[] }

const TEXT = {
  en: {
    title: "Recorded allergy",
    level: { same_substance: "Same drug", same_class: "Same drug class", cross_reaction: "Possible cross-reaction" },
    fromEhr: "from the hospital system",
    note: "Giving it records on the dose that you saw this allergy.",
    give: "Give anyway",
    cancel: "Don't give",
  },
  bg: {
    title: "Записана алергия",
    level: { same_substance: "Същият медикамент", same_class: "Същата група медикаменти", cross_reaction: "Възможна кръстосана реакция" },
    fromEhr: "от болничната система",
    note: "Прилагането записва върху дозата, че сте видели алергията.",
    give: "Приложи въпреки това",
    cancel: "Не прилагай",
  },
} as const

const STRONG: ReadonlySet<AllergyMatchLevel> = new Set(["same_substance", "same_class"])

type Hit = { dose: Dose; conflicts: AllergyConflict[] }

/** The doses this change adds that clash with a recorded allergy and carry no acknowledgement. */
export function newAllergyHits(allergies: ReturnType<typeof allergyRecords>, prev: Chart, next: Chart): Hit[] {
  if (allergies.length === 0) return []
  const before = new Set<Dose>([...prev.drugs, ...(prev.infusions ?? [])])
  return [...next.drugs, ...(next.infusions ?? [])]
    .filter(dose => !before.has(dose) && !dose.allergyAck?.length)
    .map(dose => ({ dose, conflicts: allergyConflicts(allergies, dose) }))
    .filter(hit => hit.conflicts.length > 0)
}

/**
 * Ask before a dose that clashes with a recorded allergy is added to the chart
 * (1.5.0). Never blocks: "Give anyway" adds it with the acknowledgement on the
 * dose; "Don't give" leaves the chart as it was.
 *
 * Sits on the chart's change, outside the timetable, so every way of adding a
 * bolus or starting an infusion passes through it.
 */
export function useAllergyGate({ preop, locale, ready = true }: {
  preop: { allergies?: boolean | null; allergyDetails?: unknown } | null | undefined
  locale: "en" | "bg"
  /**
   * False while the chart cannot take a dose at all (the case has not
   * started). The change then goes straight through to be refused for that,
   * rather than asking about an allergy for a dose that was never going to be
   * recorded (found on the appliance, 1.5.0).
   */
  ready?: boolean
}): {
  guard: <T extends Chart>(prev: T, apply: (next: T) => void) => (next: T) => void
  modal: ReactNode
} {
  const [pending, setPending] = useState<{ hits: Hit[]; confirm: () => void } | null>(null)
  const allergies = allergyRecords(preop)

  function guard<T extends Chart>(prev: T, apply: (next: T) => void) {
    return (next: T) => {
      if (!ready) return apply(next)
      const hits = newAllergyHits(allergies, prev, next)
      if (hits.length === 0) return apply(next)
      const acked = new Map(hits.map(hit => [hit.dose, hit.conflicts.map(c => ({ allergy: c.allergy, level: c.level }))]))
      const mark = (dose: Dose) => acked.has(dose) ? { ...dose, allergyAck: acked.get(dose) } : dose
      setPending({
        hits,
        confirm: () => apply({ ...next, drugs: next.drugs.map(mark), ...(next.infusions ? { infusions: next.infusions.map(mark) } : {}) }),
      })
    }
  }

  const text = TEXT[locale]
  const modal = pending ? (
    <div role="alertdialog" aria-label={text.title} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-2xl dark:bg-[#1e1e1e]">
        <h2 className="text-base font-bold text-rose-700 dark:text-rose-300">⚠ {text.title}</h2>
        <ul className="space-y-2">
          {pending.hits.flatMap(hit => hit.conflicts.map(conflict => (
            <li
              key={`${hit.dose.name}-${conflict.allergy}`}
              className={`rounded-lg border px-3 py-2 text-sm ${
                STRONG.has(conflict.level)
                  ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/50 dark:bg-rose-950/40 dark:text-rose-200"
                  : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-200"
              }`}
            >
              <strong>{hit.dose.name}</strong> — {conflict.allergy}
              {conflict.source === "ehr" ? ` (${text.fromEhr})` : ""}
              <span className="block text-xs font-semibold">{text.level[conflict.level]}</span>
            </li>
          )))}
        </ul>
        <p className="text-xs text-slate-600 dark:text-slate-400">{text.note}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPending(null)}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {text.cancel}
          </button>
          <button
            type="button"
            onClick={() => { pending.confirm(); setPending(null) }}
            className="flex-1 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
          >
            {text.give}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { guard, modal }
}
