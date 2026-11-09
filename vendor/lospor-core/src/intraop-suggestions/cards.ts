import { sortIntraopEvents } from "../intraop-engine"
import type { LogEvent } from "../intraop-types"
import { canonicalComplicationLabel } from "../complications"
import { isBloodProductFluid } from "../intraop-fluids"
import {
  ageYears,
  drugClasses,
  isChild,
  runningAt,
  type SuggestionPatient,
  type SuggestionPreop,
} from "./context"

/**
 * Treatment suggestions after a complication (10.2.0): the follow-up card,
 * or the next-steps checklist for a multi-step protocol. One definition per
 * complication lives in catalogue.ts; this file turns a definition into what
 * the screen shows, for this patient and this log.
 *
 * Nothing here charts anything. Each row opens the existing sheet prefilled
 * (or, for an inline row, its own control); the clinician saves or closes.
 * The PWA and the web app render the same rows, so they cannot differ.
 */

export type Words = { en: string; bg: string }
export type Locale = "en" | "bg"
export const say = (words: Words, locale: string): string => (locale === "bg" ? words.bg : words.en)

/* ---------- doses ---------- */

export type DoseSpec =
  /** The sheet's own suggestion, from the catalogue and the active ruleset. */
  | { from: "catalogue" }
  /** The sheet opens without a dose. */
  | { from: "none" }
  | { from: "fixed"; amount: number }
  | {
      from: "perKg"
      perKg: number
      /** Actual (TBW, the default) or ideal weight. */
      basis?: "TBW" | "IBW"
      /** The suggestion never goes above this; the slider keeps its own maximum. */
      cap?: number
      round?: number
      /** "up": to the next step (suxamethonium under 10 kg). */
      roundMode?: "nearest" | "up"
    }
  | { from: "custom"; amount: (patient: SuggestionPatient) => number | null }

/**
 * A dose for adults and children. `child` absent: the adult rule applies to
 * children too. `child: null`: the row is not shown for children.
 */
export type AgeDose = { adult: DoseSpec; child?: DoseSpec | null }

const roundAt = (value: number, step: number, mode: "nearest" | "up" = "nearest") => {
  const steps = value / step
  const rounded = (mode === "up" ? Math.ceil(steps - 1e-9) : Math.round(steps)) * step
  return Math.round(rounded * 1000) / 1000
}

/** The prefill a spec gives this patient: a number, "catalogue", or null for an empty sheet. */
export function doseFor(spec: DoseSpec, patient: SuggestionPatient): number | "catalogue" | null {
  switch (spec.from) {
    case "catalogue": return "catalogue"
    case "none": return null
    case "fixed": return spec.amount
    case "custom": return spec.amount(patient)
    case "perKg": {
      const weight = spec.basis === "IBW"
        ? (patient.idealWeightKg != null && patient.weightKg != null ? Math.min(patient.idealWeightKg, patient.weightKg) : patient.idealWeightKg ?? patient.weightKg)
        : patient.weightKg
      if (weight == null || !(weight > 0)) return null
      const raw = weight * spec.perKg
      const rounded = spec.round ? roundAt(raw, spec.round, spec.roundMode) : Math.round(raw * 100) / 100
      return spec.cap != null ? Math.min(rounded, spec.cap) : rounded
    }
  }
}

function specFor(dose: AgeDose, patient: SuggestionPatient): DoseSpec | null {
  if (!isChild(patient)) return dose.adult
  return dose.child === undefined ? dose.adult : dose.child
}

/* ---------- rows ---------- */

export type RowContext = {
  log: LogEvent[]
  patient: SuggestionPatient
  preop: SuggestionPreop
  /** The complication the card is for. */
  complication: LogEvent
  /** TOF monitoring ticked on the intraop form. */
  tofMonitor: boolean
  now: number
}

type RowBase = {
  id: string
  title: Words
  /** Shown only under these branch choices (Unstable / Stable, Shockable / Non-shockable). */
  branches?: readonly string[]
  /** Shown only when this holds. */
  when?: (context: RowContext) => boolean
  note?: Words
}

export type RowDef =
  | RowBase & {
      kind: "drug"
      drug: string
      route?: string
      unit: string
      dose: AgeDose
      /** Escalating doses (adenosine 6 → 12 → 18): the next one after each given in the episode. */
      escalation?: { adult: readonly DoseSpec[]; child?: readonly DoseSpec[]; episodeGapMinutes: number }
      /** A running total shown against a maximum (atropine, 3 mg). */
      totalAgainst?: number
    }
  | RowBase & { kind: "infusion"; drug: string; unit: string; rate: AgeDose }
  | RowBase & {
      kind: "fluid"
      /** A catalogue fluid, or a category to pick from (crystalloid). */
      fluid?: string
      category?: string
      concentration?: { adult: string; child?: string }
      mode: "VOLUME" | "RATE"
      amount: AgeDose
    }
  | RowBase & { kind: "stop"; target: "localAnaesthetic" | "bloodProduct" | "suspects" | "volatile" }
  | RowBase & { kind: "gas"; fio2: number; fgf: number; stopNitrous?: boolean }
  | RowBase & { kind: "relabel"; choices: readonly string[] }
  | RowBase & { kind: "alsoLog"; complications: readonly string[] }
  | RowBase & { kind: "openCard"; complication: string }
  | RowBase & { kind: "event"; label: string }
  | RowBase & { kind: "shock"; synchronized: boolean }
  | RowBase & { kind: "lab"; tests: readonly string[] }
  | RowBase & { kind: "question"; prompt: Words; logs?: string; reveals: readonly string[] }
  | RowBase & { kind: "resolve" }
  | RowBase & { kind: "note" }
  | RowBase & { kind: "access"; access: "VENOUS" | "ARTERIAL" | "CENTRAL" }
  | RowBase & { kind: "airway" }
  | RowBase & { kind: "deepen" }
  | RowBase & { kind: "memory"; items: readonly Words[] }

export type CardDef = {
  /** The complications this card is for, as the catalogue names them. */
  complications: readonly string[]
  kind: "card" | "checklist"
  /** Time-critical: a red strip with the time since onset. */
  redStrip?: boolean
  question?: Words
  branches?: { prompt?: Words; options: readonly { id: string; title: Words }[] }
  rows: readonly RowDef[]
}

/* ---------- resolved, as the screens show it ---------- */

export type RowUse = { count: number; lastTs: string; lastAmount?: string; lastUnit?: string }

export type ResolvedRow = {
  id: string
  kind: RowDef["kind"]
  title: Words
  note?: Words
  branches?: readonly string[]
  /** For drug, infusion and fluid rows: what the sheet opens with. */
  prefill?: {
    drug?: string
    fluid?: string
    category?: string
    route?: string
    unit?: string
    /** A number, "catalogue" for the sheet's own suggestion, or null for empty. */
    amount: number | "catalogue" | null
    concentration?: string
    mode?: "VOLUME" | "RATE"
  }
  /** Charted since the complication: shows ✓ with the last dose and time. */
  used: RowUse | null
  /** An escalating row: the step it is on (0-based) and how many there are. */
  step?: { index: number; of: number }
  /** A running total against its maximum. */
  total?: { amount: number; max: number; unit: string }
  def: RowDef
}

export type ResolvedCard = {
  complicationEventId: string
  complication: string
  kind: CardDef["kind"]
  redStrip: boolean
  onset: string
  question?: Words
  branches?: CardDef["branches"]
  rows: ResolvedRow[]
}

const ms = (value: string) => Date.parse(value)

function after(log: LogEvent[], since: string): LogEvent[] {
  const start = ms(since)
  return sortIntraopEvents(log).filter(event => ms(event.ts) >= start)
}

function uses(events: LogEvent[], amountOf: (event: LogEvent) => string | undefined = event => event.dose, unitOf: (event: LogEvent) => string | undefined = event => event.unit): RowUse | null {
  if (events.length === 0) return null
  const last = events[events.length - 1]!
  return { count: events.length, lastTs: last.ts, lastAmount: amountOf(last), lastUnit: unitOf(last) }
}

function stopTargets(row: Extract<RowDef, { kind: "stop" }>, context: RowContext): LogEvent[] {
  const running = runningAt(context.log, context.complication.ts).map(item => item.startEvent)
  switch (row.target) {
    case "localAnaesthetic": return running.filter(event => event.type === "infusion_start" && drugClasses(event).has("localAnaesthetic"))
    case "bloodProduct": return running.filter(event => event.type === "fluid_start" && isBloodProductFluid({ name: event.name ?? "", category: event.category }))
    case "volatile": return running.filter(event => event.type === "agent_start")
    case "suspects": return running.filter(event => event.type === "infusion_start" || event.type === "fluid_start")
  }
}

/**
 * The card an entry was written from, by its tag (`card:<Complication>:<row>`), or null for an entry charted by hand.
 * The complication is everything between the first and the last colon, so a name with a colon still reads.
 */
export function cardOfSuggestion(tag: string | null | undefined): string | null {
  if (!tag || !tag.startsWith("card:")) return null
  const last = tag.lastIndexOf(":")
  return last > 4 ? tag.slice(5, last) : null
}

/**
 * Whether an entry was given from the card of ANOTHER complication on this log. Ephedrine given from the
 * Hypotension card is not a step of the High spinal card, so it must not close it; an entry charted by hand cannot
 * be told apart and counts for every card it fits. A tag naming a complication that is not elsewhere on the log
 * (this one, before it was relabelled) still counts.
 */
function fromAnotherCard(event: LogEvent, context: RowContext): boolean {
  const owner = cardOfSuggestion(event.suggestion)
  if (owner == null || owner === context.complication.label) return false
  return context.log.some(other => other.type === "complication" && other.id !== context.complication.id && other.label === owner)
}

function rowUse(row: RowDef, context: RowContext): RowUse | null {
  const since = context.complication.ts
  const later = after(context.log, since).filter(event => event.id !== context.complication.id && !fromAnotherCard(event, context))
  switch (row.kind) {
    case "drug": return uses(later.filter(event => event.type === "drug" && event.name === row.drug && (!row.route || !event.drugRoute || event.drugRoute === row.route)))
    case "infusion": return uses(later.filter(event => event.type === "infusion_start" && event.name === row.drug), event => event.rate)
    case "fluid": return uses(later.filter(event => event.type === "fluid_start"
      && (row.fluid ? event.name === row.fluid : event.category === row.category)), event => event.volume ?? event.rate, () => "mL")
    case "stop": {
      const targets = new Set(stopTargets(row, context).map(event => event.infId ?? event.fluidId ?? event.name))
      return uses(later.filter(event => (event.type === "infusion_stop" && targets.has(event.infId))
        || (event.type === "fluid_end" && targets.has(event.fluidId))
        || (event.type === "agent_stop" && (targets.has(event.name) || (!event.name && targets.size > 0)))))
    }
    case "gas": return uses(later.filter(event => (event.type === "gas_change" || event.type === "gas_start") && (event.fio2 ?? 0) >= row.fio2), event => event.fio2 != null ? String(event.fio2) : undefined, () => "%")
    case "event": return uses(later.filter(event => event.type === "clinical_event" && event.label === row.label), () => undefined, () => undefined)
    case "shock": return uses(later.filter(event => event.type === "defibrillation" && !!event.synchronized === row.synchronized), event => event.energyJ != null ? String(event.energyJ) : undefined, () => "J")
    case "alsoLog": return uses(later.filter(event => event.type === "complication" && row.complications.includes(canonicalComplicationLabel(event.label ?? ""))), () => undefined, () => undefined)
    case "openCard": return uses(later.filter(event => event.type === "complication" && event.label === row.complication), () => undefined, () => undefined)
    case "question": return row.logs ? uses(later.filter(event => event.type === "complication" && event.label === row.logs), () => undefined, () => undefined) : null
    case "resolve": return context.complication.endTs && context.complication.endTs !== context.complication.ts
      ? { count: 1, lastTs: context.complication.endTs }
      : null
    case "airway": return uses(later.filter(event => event.type === "clinical_event" && (event.label === "Reintubation" || event.label === "Intubated" || event.label === "Airway exchange")), () => undefined, () => undefined)
    case "access": return uses(later.filter(event => event.type === "clinical_event" && accessEventLabels(row.access).includes(event.label ?? "")), () => undefined, () => undefined)
    default: return null
  }
}

/** The clinical events that chart a new line of a kind. */
export function accessEventLabels(access: "VENOUS" | "ARTERIAL" | "CENTRAL"): string[] {
  switch (access) {
    case "VENOUS": return ["IV line in", "IO access"]
    case "ARTERIAL": return ["Art line in"]
    case "CENTRAL": return ["CVC in", "PICC"]
  }
}

/** Adenosine's episode: the doses given with less than the gap between them, ending at the latest. */
function escalationIndex(row: Extract<RowDef, { kind: "drug" }>, context: RowContext, stepsCount: number): number {
  const gap = (row.escalation?.episodeGapMinutes ?? 30) * 60_000
  const doses = sortIntraopEvents(context.log).filter(event => event.type === "drug" && event.name === row.drug)
  if (doses.length === 0) return 0
  if (context.now - ms(doses[doses.length - 1]!.ts) > gap) return 0
  let count = 1
  for (let index = doses.length - 1; index > 0; index--) {
    if (ms(doses[index]!.ts) - ms(doses[index - 1]!.ts) > gap) break
    count++
  }
  return Math.min(count, stepsCount - 1)
}

function caseTotal(log: LogEvent[], drug: string): number {
  return log.filter(event => event.type === "drug" && event.name === drug)
    .reduce((sum, event) => sum + (Number.parseFloat(event.dose ?? "") || 0), 0)
}

function visible(row: RowDef, context: RowContext): boolean {
  if (row.when && !row.when(context)) return false
  if ("dose" in row && specFor(row.dose, context.patient) === null) return false
  if (row.kind === "infusion" && specFor(row.rate, context.patient) === null) return false
  if (row.kind === "fluid" && specFor(row.amount, context.patient) === null) return false
  return true
}

function resolveRow(row: RowDef, context: RowContext): ResolvedRow {
  const base: ResolvedRow = {
    id: row.id,
    kind: row.kind,
    title: row.title,
    ...(row.note ? { note: row.note } : {}),
    ...(row.branches ? { branches: row.branches } : {}),
    used: rowUse(row, context),
    def: row,
  }
  const patient = context.patient
  if (row.kind === "drug") {
    let spec = specFor(row.dose, patient)!
    let step: ResolvedRow["step"]
    if (row.escalation) {
      const steps = (isChild(patient) && row.escalation.child) ? row.escalation.child : row.escalation.adult
      const index = escalationIndex(row, context, steps.length)
      spec = steps[index]!
      step = { index, of: steps.length }
    }
    return {
      ...base,
      prefill: { drug: row.drug, route: row.route, unit: row.unit, amount: doseFor(spec, patient) },
      ...(step ? { step } : {}),
      ...(row.totalAgainst != null ? { total: { amount: caseTotal(context.log, row.drug), max: row.totalAgainst, unit: row.unit } } : {}),
    }
  }
  if (row.kind === "infusion") {
    return { ...base, prefill: { drug: row.drug, unit: row.unit, amount: doseFor(specFor(row.rate, patient)!, patient) } }
  }
  if (row.kind === "fluid") {
    const concentration = row.concentration ? (isChild(patient) && row.concentration.child ? row.concentration.child : row.concentration.adult) : undefined
    return {
      ...base,
      prefill: {
        fluid: row.fluid,
        category: row.category,
        // Fluid rates are recorded in mL/h (the API refuses any other unit).
        unit: row.mode === "RATE" ? "mL/h" : "mL",
        amount: doseFor(specFor(row.amount, patient)!, patient),
        mode: row.mode,
        ...(concentration ? { concentration } : {}),
      },
    }
  }
  return base
}

/** The card for a complication event, or null when it has no suggestions. */
export function resolveCard(def: CardDef, context: Omit<RowContext, "now"> & { now: Date | string | number }): ResolvedCard {
  const now = new Date(context.now).getTime()
  const rowContext: RowContext = { ...context, now }
  return {
    complicationEventId: context.complication.id,
    complication: context.complication.label ?? "",
    kind: def.kind,
    redStrip: !!def.redStrip,
    onset: context.complication.ts,
    ...(def.question ? { question: def.question } : {}),
    ...(def.branches ? { branches: def.branches } : {}),
    rows: def.rows.filter(row => visible(row, rowContext)).map(row => resolveRow(row, rowContext)),
  }
}

/** The running items a stop row would stop, for the screen to list them. */
export function stopRowTargets(row: ResolvedRow, context: Omit<RowContext, "now">): LogEvent[] {
  return row.def.kind === "stop" ? stopTargets(row.def, { ...context, now: Date.now() }) : []
}

/** Drugs charted in the 30 minutes before a complication, newest first: the suspects in anaphylaxis. */
export function suspectDrugs(log: LogEvent[], at: string, minutes = 30): LogEvent[] {
  const end = ms(at)
  const start = end - minutes * 60_000
  return sortIntraopEvents(log)
    .filter(event => (event.type === "drug" || event.type === "infusion_start" || event.type === "fluid_start") && ms(event.ts) >= start && ms(event.ts) <= end)
    .reverse()
}

export { ageYears }
