import { convertDoseAmount, localAnaestheticBudgetText, localAnaestheticCheck, mhHistoryWarning, REMINDER_IDS, type SuggestionContext } from "@lospor/core/intraop-suggestions"
import { automationEnabled, automationGroupEnabled } from "@lospor/core/intraop-automation"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { PhoneSuggestionSheets } from "@/components/intraop/SuggestionSheetHost"

/**
 * The phone's sheets as a suggestion card asks for them (10.2.0): each opens
 * prefilled at now, and the entry it saves carries the suggestion's tag
 * through `pending` (read by the screen's save, cleared when the sheet
 * closes unsaved). A dose moves only between units it converts to.
 */

type Drug = { name: string; unit: string }
type DrugCat = { cat: string; color: string; drugs: Drug[] }
type Infusion = { name: string; unit: string; color: string }
type Fluid = { name: string; cat: string; color: string }

export type PhoneSheetDeps = {
  pending: { current: string | null }
  nowIso: () => string
  clockOf: (iso: string) => string
  setEntryTs: (ts: string | null) => void
  drugCats: DrugCat[]
  openDrugPreset: (name: string, dose?: string) => void
  infusions: Infusion[]
  setInfDrug: (option: never) => void
  setInfRate: (rate: string) => void
  setInfOpen: (open: boolean) => void
  fluids: Fluid[]
  log: LogEvent[]
  openFluid: (ts?: string) => void
  setFlFluid: (option: never) => void
  setFlVol: (volume: string) => void
  setFlEntryMode: (mode: "VOLUME" | "RATE") => void
  setFlRate: (rate: string) => void
  openShock: () => void
  openLab: () => void
  openGas: (fio2: number, fgf: number, air: boolean) => void
  deepenTargets: () => { key: string; label: string; open: () => void }[]
  saveEvent: (event: Partial<LogEvent> & { type: LogEvent["type"] }) => void
  displayName: (event: LogEvent) => string
  extras?: Pick<PhoneSuggestionSheets, "linesOf" | "markLineFailed" | "openAirway">
}

/** The fluid for a row that names a kind ("crystalloid"): the last of that kind charted, else the first listed. */
export function phoneFluidFor(category: string | undefined, log: readonly LogEvent[], fluids: readonly Fluid[]): Fluid | null {
  if (!category) return null
  const used = [...log].reverse().find(event => event.type === "fluid_start" && event.category === category)
  return fluids.find(fluid => fluid.name === used?.name) ?? fluids.find(fluid => fluid.cat === category) ?? null
}

export function buildPhoneSuggestionSheets(deps: PhoneSheetDeps): PhoneSuggestionSheets {
  return {
    nowIso: deps.nowIso,
    clockOf: deps.clockOf,
    openDrug: ({ name, mode, amount, unit, suggestion }) => {
      deps.setEntryTs(null)
      deps.pending.current = suggestion
      if (mode === "infusion") {
        const option = deps.infusions.find(item => item.name === name)
        if (!option) { deps.pending.current = null; return }
        deps.setInfDrug(option as never)
        deps.setInfRate(typeof amount === "number" && (!unit || unit === option.unit) ? String(amount) : "")
        deps.setInfOpen(true)
        return
      }
      const drug = deps.drugCats.flatMap(cat => cat.drugs).find(item => item.name === name)
      const dose = typeof amount === "number" && drug ? convertDoseAmount(amount, unit ?? drug.unit, drug.unit) : null
      deps.openDrugPreset(name, dose == null ? "" : String(dose))
    },
    openFluid: ({ name, category, amount, mode, suggestion }) => {
      const fluid = name ? deps.fluids.find(item => item.name === name) ?? null : phoneFluidFor(category, deps.log, deps.fluids)
      if (!fluid) return
      deps.pending.current = suggestion
      deps.openFluid()
      deps.setFlFluid(fluid as never)
      if (mode === "RATE") {
        deps.setFlEntryMode("RATE")
        if (typeof amount === "number") deps.setFlRate(String(amount))
      } else if (typeof amount === "number") {
        deps.setFlEntryMode("VOLUME")
        deps.setFlVol(String(amount))
      }
    },
    openShock: suggestion => { deps.pending.current = suggestion; deps.openShock() },
    openLab: deps.openLab,
    openGas: (fio2, fgf, air, suggestion) => { deps.pending.current = suggestion; deps.openGas(fio2, fgf, air) },
    deepenTargets: deps.deepenTargets,
    stop: (event, suggestion) => {
      if (event.type === "infusion_start" && event.infId) deps.saveEvent({ type: "infusion_stop", infId: event.infId, name: event.name, color: event.color, suggestion })
      else if (event.type === "fluid_start" && event.fluidId) deps.saveEvent({ type: "fluid_end", fluidId: event.fluidId, name: event.name, color: event.color, fluidEntryMode: event.fluidEntryMode, suggestion })
      else if (event.type === "agent_start") deps.saveEvent({ type: "agent_stop", name: event.name, suggestion })
    },
    displayName: deps.displayName,
    ...deps.extras,
  }
}

/** The event a sheet saves, with the suggestion it was opened from, once. */
export function tagWithSuggestion<T extends { type: string }>(event: T, pending: { current: string | null }): T & { suggestion?: string } {
  const tag = pending.current
  if (!tag || !["drug", "infusion_start", "fluid_start", "gas_start", "gas_change", "defibrillation"].includes(event.type)) return event
  pending.current = null
  return { ...event, suggestion: tag }
}

/**
 * What an entry about to be saved needs a word on first (10.2.0, reminders
 * group): a volatile or suxamethonium with an MH history on the preop record
 * (P1), a local anaesthetic bolus over the patient's maximum (E2). Empty
 * when nothing needs saying; nothing is ever blocked.
 */
export function phoneGateWarnings(
  context: Omit<SuggestionContext, "now"> | null,
  log: LogEvent[],
  entry: { type: string; name?: string; atcCode?: string; dose?: string; unit?: string; drugRoute?: string; concentration?: string },
  words: { mh: string; laMax: string },
  locale: string,
  now: string,
): string[] {
  if (!context || !automationGroupEnabled(context.settings, "reminders", context.user)) return []
  const warnings: string[] = []
  const mhOn = automationEnabled(context.settings, "reminders", REMINDER_IDS.mhHistory, context.user)
  const laOn = automationEnabled(context.settings, "reminders", REMINDER_IDS.localAnaestheticMax, context.user)
  if (mhOn && (entry.type === "agent_start" || entry.type === "drug") && mhHistoryWarning(context.preop, { type: entry.type as never, name: entry.name, atcCode: entry.atcCode })) warnings.push(words.mh)
  if (laOn && entry.type === "drug" && entry.name) {
    const check = localAnaestheticCheck(log as never, context.patient, { id: "pending", ts: now, type: "drug", name: entry.name, dose: entry.dose, unit: entry.unit, drugRoute: entry.drugRoute, concentration: entry.concentration })
    if (check?.wouldExceed) warnings.push([words.laMax, localAnaestheticBudgetText(check, entry.name, locale)].filter(Boolean).join("\n"))
  }
  return warnings
}
