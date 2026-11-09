import { sortIntraopEvents } from "../intraop-engine"
import { calculateRateFluidVolumeMl } from "../intraop-fluids"
import type { IntraopEventOps } from "../intraop-timetable-edit"
import type { LogEvent } from "../intraop-types"
import { isChild, lastEvent, type SuggestionPatient } from "./context"
import { dantroleneVialsOpened, dantroleneVialsView, type DantroleneVialsView } from "./dantrolene-vials"

/**
 * Timed follow-ups after a treatment (10.2.0). They arrive in the waiting
 * list when due, keep arriving while a checklist is minimised, and stop once
 * the checklist is closed with Done. None of them charts anything: each opens
 * the sheet for the next dose, prefilled.
 *
 * - Cardiac arrest: the 2-minute rhythm check, adrenaline every 3-5 minutes
 *   (after the 3rd shock when shockable, at once when not), amiodarone after
 *   the 3rd and 5th shocks; until ROSC or Death.
 * - LAST: a repeat lipid bolus 5 minutes after the last if still unstable
 *   (two repeats at most), doubling the infusion, and a warning at 12 mL/kg.
 * - Anaphylaxis: after two IV adrenaline boluses, an adrenaline infusion.
 * - Malignant hyperthermia: dantrolene 1 mg/kg every 10 minutes while signs
 *   persist, with the total in mg, mg/kg and vials, and a note at 10 mg/kg.
 * - Tourniquet: 90 and 120 minutes (children 60 and 75), and still on at
 *   procedure end or case end.
 */

export type TimerKind =
  | "arrestRhythmCheck" | "arrestAdrenaline" | "arrestAmiodarone"
  | "lastRepeatBolus" | "lastDoubleInfusion" | "lastMaximum"
  | "anaphylaxisInfusion"
  | "dantroleneRepeat" | "dantroleneMaximum"
  | "tourniquetWarning" | "tourniquetLimit" | "tourniquetStillOn"

export type TimerItem = {
  key: string
  kind: TimerKind
  dueAt: string
  /** The complication the follow-up belongs to; the tourniquet ones name the site instead. */
  complicationEventId?: string
  site?: string
  /** A dose to prefill, when the follow-up is one. */
  dose?: { drug?: string; fluid?: string; amount: number | null; unit: string; mode?: "VOLUME" | "RATE" }
  /** Numbers for the words. */
  detail?: Record<string, number | string>
}

export type TimerContext = {
  patient: SuggestionPatient
  now: Date | string | number
  endedAt?: Date | string | number | null
  /** The hospital's dantrolene vial, in mg. */
  /** The vial sizes the hospital stocks, in mg (Status). */
  dantroleneVialsMg: readonly number[]
}

const ms = (value: string | number | Date) => value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value)
const iso = (value: number) => new Date(value).toISOString()
const MIN = 60_000
const dose = (event: LogEvent) => Number.parseFloat(event.dose ?? "") || 0

const closedWithDone = (log: LogEvent[], complication: LogEvent) =>
  log.some(event => event.type === "prompt_answer" && event.answer === "done" && event.answerFor === complication.id)

const dismissed = (log: LogEvent[], kind: TimerKind, forKey: string) =>
  log.some(event => event.type === "prompt_answer" && event.answerKind === `timer:${kind}` && event.answerFor === forKey)

function since(log: LogEvent[], from: string, until: number = Number.POSITIVE_INFINITY): LogEvent[] {
  return sortIntraopEvents(log).filter(event => ms(event.ts) >= ms(from) && ms(event.ts) <= until)
}

/* ---------- cardiac arrest ---------- */

export type ArrestStatus = { shocks: number; adrenalineDoses: number; amiodaroneDoses: number; nextRhythmCheck: string; nextAdrenaline: string | null; ended: boolean }

export function arrestStatus(log: LogEvent[], arrest: LogEvent, context: TimerContext): ArrestStatus {
  const now = ms(context.now)
  const after = since(log, arrest.ts, now)
  const end = after.find(event => event.type === "clinical_event" && (event.label === "ROSC" || event.label === "Death (exitus letalis)"))
  const shocks = after.filter(event => event.type === "defibrillation" && !event.synchronized)
  const child = isChild(context.patient)
  const arrestDose = (event: LogEvent) => event.type === "drug" && event.name === "Epinephrine / Adrenaline" && event.drugRoute !== "IM"
    && (child ? context.patient.weightKg != null && dose(event) >= 9 * context.patient.weightKg : dose(event) >= 1000)
  const adrenaline = after.filter(arrestDose)
  const amiodarone = after.filter(event => event.type === "drug" && event.name === "Amiodarone")
  const cpr = lastEvent(log, "CPR started", now)
  const cycleFrom = Math.max(ms(arrest.ts), cpr && ms(cpr.ts) >= ms(arrest.ts) ? ms(cpr.ts) : 0, ...shocks.map(event => ms(event.ts)))
  let nextAdrenaline: number | null
  // Every 5 minutes after the last dose: the end of the 3-5 minute range (maintainer, 10.2.0).
  if (adrenaline.length > 0) nextAdrenaline = ms(adrenaline[adrenaline.length - 1]!.ts) + 5 * MIN
  else if (shocks.length === 0) nextAdrenaline = ms(arrest.ts)
  else if (shocks.length >= 3) nextAdrenaline = ms(shocks[2]!.ts)
  else nextAdrenaline = null
  return {
    shocks: shocks.length,
    adrenalineDoses: adrenaline.length,
    amiodaroneDoses: amiodarone.length,
    nextRhythmCheck: iso(cycleFrom + 2 * MIN),
    nextAdrenaline: nextAdrenaline == null ? null : iso(nextAdrenaline),
    ended: !!end,
  }
}

function arrestTimers(log: LogEvent[], arrest: LogEvent, context: TimerContext): TimerItem[] {
  const status = arrestStatus(log, arrest, context)
  if (status.ended) return []
  const child = isChild(context.patient)
  const weight = context.patient.weightKg
  const items: TimerItem[] = [{ key: `timer:arrestRhythmCheck:${arrest.id}:${status.nextRhythmCheck}`, kind: "arrestRhythmCheck", dueAt: status.nextRhythmCheck, complicationEventId: arrest.id, detail: { shocks: status.shocks } }]
  if (status.nextAdrenaline) {
    items.push({ key: `timer:arrestAdrenaline:${arrest.id}:${status.nextAdrenaline}`, kind: "arrestAdrenaline", dueAt: status.nextAdrenaline, complicationEventId: arrest.id,
      dose: { drug: "Epinephrine / Adrenaline", amount: child ? (weight ? Math.min(1000, Math.round(weight) * 10) : null) : 1000, unit: "mcg" }, detail: { doses: status.adrenalineDoses } })
  }
  const shocks = sortIntraopEvents(log).filter(event => event.type === "defibrillation" && !event.synchronized && ms(event.ts) >= ms(arrest.ts))
  const amiodarone = (index: number, adult: number) => ({
    key: `timer:arrestAmiodarone:${arrest.id}:${index}`, kind: "arrestAmiodarone" as const, dueAt: shocks[index]!.ts, complicationEventId: arrest.id,
    dose: { drug: "Amiodarone", amount: child ? (weight ? Math.round(weight * 5) : null) : adult, unit: "mg" }, detail: { afterShock: index + 1 },
  })
  if (status.shocks >= 3 && status.amiodaroneDoses === 0) items.push(amiodarone(2, 300))
  else if (status.shocks >= 5 && status.amiodaroneDoses === 1) items.push(amiodarone(4, 150))
  return items
}

/* ---------- LAST ---------- */

export type LipidStatus = { boluses: number; totalMl: number; maxMl: number | null; infusionRunning: boolean }

export function lipidStatus(log: LogEvent[], last: LogEvent, context: TimerContext): LipidStatus {
  const now = ms(context.now)
  const lipid = since(log, last.ts, now).filter(event => event.type === "fluid_start" && event.name === "Lipid emulsion 20%")
  const boluses = lipid.filter(event => event.fluidEntryMode !== "RATE")
  const infusions = lipid.filter(event => event.fluidEntryMode === "RATE")
  let totalMl = boluses.reduce((sum, event) => sum + (Number.parseFloat(event.volume ?? "") || 0), 0)
  let infusionRunning = false
  for (const start of infusions) {
    const stop = sortIntraopEvents(log).find(event => event.type === "fluid_end" && event.fluidId === start.fluidId && ms(event.ts) >= ms(start.ts))
    if (!stop || ms(stop.ts) > now) infusionRunning = true
    const changes = log.filter(event => event.type === "fluid_rate" && event.fluidId === start.fluidId)
      .map(event => ({ ts: event.ts, rate: event.rate ?? "0", unit: event.unit }))
    totalMl += calculateRateFluidVolumeMl({ startTs: start.ts, endTs: stop && ms(stop.ts) <= now ? stop.ts : iso(now), rate: start.rate ?? "0", rateChanges: changes })
  }
  const weight = context.patient.weightKg
  return { boluses: boluses.length, totalMl: Math.round(totalMl), maxMl: weight ? Math.round(12 * weight) : null, infusionRunning }
}

function lastTimers(log: LogEvent[], last: LogEvent, context: TimerContext): TimerItem[] {
  const status = lipidStatus(log, last, context)
  const items: TimerItem[] = []
  const weight = context.patient.weightKg
  const boluses = since(log, last.ts, ms(context.now)).filter(event => event.type === "fluid_start" && event.name === "Lipid emulsion 20%" && event.fluidEntryMode !== "RATE")
  if (boluses.length >= 1 && boluses.length < 3) {
    const dueAt = iso(ms(boluses[boluses.length - 1]!.ts) + 5 * MIN)
    items.push({ key: `timer:lastRepeatBolus:${last.id}:${boluses.length}`, kind: "lastRepeatBolus", dueAt, complicationEventId: last.id,
      dose: { fluid: "Lipid emulsion 20%", amount: weight ? Math.round(weight * 1.5) : null, unit: "mL", mode: "VOLUME" }, detail: { repeat: boluses.length } })
  }
  if (status.infusionRunning) {
    const start = since(log, last.ts).find(event => event.type === "fluid_start" && event.name === "Lipid emulsion 20%" && event.fluidEntryMode === "RATE")!
    items.push({ key: `timer:lastDoubleInfusion:${last.id}`, kind: "lastDoubleInfusion", dueAt: iso(ms(start.ts) + 5 * MIN), complicationEventId: last.id,
      dose: { fluid: "Lipid emulsion 20%", amount: weight ? Math.round(weight * 30) : null, unit: "mL/h", mode: "RATE" } })
  }
  if (status.maxMl != null && status.totalMl >= status.maxMl) {
    items.push({ key: `timer:lastMaximum:${last.id}`, kind: "lastMaximum", dueAt: iso(ms(context.now)), complicationEventId: last.id, detail: { totalMl: status.totalMl, maxMl: status.maxMl } })
  }
  return items
}

/* ---------- anaphylaxis ---------- */

function anaphylaxisTimers(log: LogEvent[], reaction: LogEvent): TimerItem[] {
  const after = since(log, reaction.ts)
  const boluses = after.filter(event => event.type === "drug" && event.name === "Epinephrine / Adrenaline" && event.drugRoute !== "IM")
  const infusion = after.some(event => event.type === "infusion_start" && event.name === "Epinephrine / Adrenaline")
  if (boluses.length < 2 || infusion) return []
  return [{ key: `timer:anaphylaxisInfusion:${reaction.id}`, kind: "anaphylaxisInfusion", dueAt: boluses[1]!.ts, complicationEventId: reaction.id,
    dose: { drug: "Epinephrine / Adrenaline", amount: null, unit: "mcg/kg/min" } }]
}

/* ---------- malignant hyperthermia ---------- */

export type DantroleneStatus = { totalMg: number; mgPerKg: number | null; vials: number; lastDoseTs: string | null }

export function dantroleneStatus(log: LogEvent[], mh: LogEvent, context: TimerContext): DantroleneStatus {
  const doses = since(log, mh.ts, ms(context.now)).filter(event => event.type === "drug" && event.name === "Dantrolene")
  const totalMg = doses.reduce((sum, event) => sum + dose(event), 0)
  const weight = context.patient.weightKg
  return {
    totalMg,
    mgPerKg: weight ? Math.round((totalMg / weight) * 10) / 10 : null,
    vials: dantroleneVialsOpened(doses.map(dose), context.dantroleneVialsMg).vials,
    lastDoseTs: doses.length ? doses[doses.length - 1]!.ts : null,
  }
}

/** The dantrolene doses given since the MH was charted, in mg. */
export function dantroleneDosesMg(log: LogEvent[], mh: LogEvent, now: Date | string | number): number[] {
  return since(log, mh.ts, ms(now)).filter(event => event.type === "drug" && event.name === "Dantrolene").map(dose)
}

/**
 * The vials the MH card draws for the dose in hand (10.2.0): this patient's
 * weight at perKg, planned from the sizes the hospital stocks, with the doses
 * already given. Null without a weight.
 */
export function dantroleneCardVials(log: LogEvent[], mh: LogEvent, context: TimerContext, perKg: number): DantroleneVialsView | null {
  const weightKg = context.patient.weightKg
  if (!weightKg) return null
  return dantroleneVialsView({ weightKg, perKg, givenDosesMg: dantroleneDosesMg(log, mh, context.now), stocked: context.dantroleneVialsMg })
}

function dantroleneTimers(log: LogEvent[], mh: LogEvent, context: TimerContext): TimerItem[] {
  const status = dantroleneStatus(log, mh, context)
  if (!status.lastDoseTs) return []
  const weight = context.patient.weightKg
  const items: TimerItem[] = [{
    key: `timer:dantroleneRepeat:${mh.id}:${status.lastDoseTs}`, kind: "dantroleneRepeat", dueAt: iso(ms(status.lastDoseTs) + 10 * MIN), complicationEventId: mh.id,
    dose: { drug: "Dantrolene", amount: weight ? Math.round(weight) : null, unit: "mg" },
    detail: { totalMg: status.totalMg, mgPerKg: status.mgPerKg ?? "", vials: status.vials },
  }]
  if (status.mgPerKg != null && status.mgPerKg >= 10) {
    items.push({ key: `timer:dantroleneMaximum:${mh.id}`, kind: "dantroleneMaximum", dueAt: status.lastDoseTs, complicationEventId: mh.id, detail: { mgPerKg: status.mgPerKg } })
  }
  return items
}

/* ---------- tourniquet ---------- */

export const TOURNIQUET_MINUTES = Object.freeze({ adult: { warning: 90, limit: 120 }, child: { warning: 60, limit: 75 } })
/** A release shorter than this is a pause: re-inflating carries the time on. */
export const TOURNIQUET_RESET_MINUTES = 10

export type TourniquetStatus = { site: string; onEventId: string; since: string; minutes: number; running: boolean; offTs?: string }

/** Each site's tourniquet: when its time started counting and whether it is on now. */
export function tourniquetStatus(log: LogEvent[], now: Date | string | number): TourniquetStatus[] {
  const at = ms(now)
  const bySite = new Map<string, TourniquetStatus>()
  for (const event of sortIntraopEvents(log)) {
    if (event.type !== "clinical_event" || ms(event.ts) > at) continue
    const site = event.site ?? "unknown"
    const current = bySite.get(site)
    if (event.label === "Tourniquet on") {
      const pause = current && !current.running && current.offTs ? ms(event.ts) - ms(current.offTs) : Number.POSITIVE_INFINITY
      if (current && !current.running && pause < TOURNIQUET_RESET_MINUTES * MIN) {
        bySite.set(site, { ...current, running: true, offTs: undefined })
      } else if (!current?.running) {
        bySite.set(site, { site, onEventId: event.id, since: event.ts, minutes: 0, running: true })
      }
    } else if (event.label === "Tourniquet off") {
      const target = current?.running ? current : event.site == null ? [...bySite.values()].find(item => item.running) : undefined
      if (target) bySite.set(target.site, { ...target, running: false, offTs: event.ts })
    }
  }
  return [...bySite.values()].map(item => ({ ...item, minutes: Math.floor(((item.running ? at : ms(item.offTs!)) - ms(item.since)) / MIN) }))
}

function tourniquetTimers(log: LogEvent[], context: TimerContext): TimerItem[] {
  const limits = isChild(context.patient) ? TOURNIQUET_MINUTES.child : TOURNIQUET_MINUTES.adult
  const now = ms(context.now)
  const items: TimerItem[] = []
  for (const tourniquet of tourniquetStatus(log, context.now).filter(item => item.running)) {
    const start = ms(tourniquet.since)
    items.push({ key: `timer:tourniquetWarning:${tourniquet.onEventId}`, kind: "tourniquetWarning", dueAt: iso(start + limits.warning * MIN), site: tourniquet.site, detail: { minutes: limits.warning } })
    items.push({ key: `timer:tourniquetLimit:${tourniquet.onEventId}`, kind: "tourniquetLimit", dueAt: iso(start + limits.limit * MIN), site: tourniquet.site, detail: { minutes: limits.limit } })
    const ended = lastEvent(log, "Procedure ended", now)
    const endAt = ended && ms(ended.ts) >= start ? ms(ended.ts) : context.endedAt != null ? ms(context.endedAt) : null
    if (endAt != null) items.push({ key: `timer:tourniquetStillOn:${tourniquet.onEventId}`, kind: "tourniquetStillOn", dueAt: iso(endAt), site: tourniquet.site })
  }
  return items
}

/* ---------- all ---------- */

/** The follow-ups due now and not dismissed, earliest first. */
export function dueTimers(log: LogEvent[], context: TimerContext): TimerItem[] {
  const now = ms(context.now)
  const items: TimerItem[] = []
  for (const complication of log.filter(event => event.type === "complication")) {
    if (closedWithDone(log, complication)) continue
    switch (complication.label) {
      case "Cardiac arrest": items.push(...arrestTimers(log, complication, context)); break
      case "Local anaesthetic systemic toxicity (LAST)": case "LAST": items.push(...lastTimers(log, complication, context)); break
      case "Anaphylaxis / allergic reaction": case "Latex reaction": items.push(...anaphylaxisTimers(log, complication)); break
      case "Malignant hyperthermia": items.push(...dantroleneTimers(log, complication, context)); break
    }
  }
  items.push(...tourniquetTimers(log, context))
  return items
    .filter(item => ms(item.dueAt) <= now && !dismissed(log, item.kind, item.key))
    .sort((a, b) => ms(a.dueAt) - ms(b.dueAt))
}

/** A follow-up's "Not now": that one item, never the next one due. */
export function timerDismissOps(item: TimerItem, now: Date | string | number): IntraopEventOps {
  const ts = new Date(now).toISOString()
  return { add: [{ id: `pa-${item.key.replace(/[^a-z0-9]+/gi, "-")}`, ts, type: "prompt_answer", answerKind: `timer:${item.kind}`, answerFor: item.key, answer: "not_now", recordedAt: ts }], update: [], remove: [] }
}

/** The follow-up's line, in the screen's language. Units in English in both. */
export function timerText(item: TimerItem, locale: string): string {
  const bg = locale === "bg"
  const d = item.detail ?? {}
  const amount = item.dose?.amount != null ? ` ${item.dose.amount} ${item.dose.unit}` : ""
  switch (item.kind) {
    case "arrestRhythmCheck": return bg ? "2 минути: проверка на ритъма" : "2 minutes: rhythm check"
    case "arrestAdrenaline": return bg ? `Адреналин${amount} (на 5 min)` : `Adrenaline${amount} (every 5 min)`
    case "arrestAmiodarone": return bg ? `Амиодарон${amount} след ${d.afterShock}-ия шок` : `Amiodarone${amount} after shock ${d.afterShock}`
    case "lastRepeatBolus": return bg ? `Все още нестабилен? Повторен липиден болус${amount}` : `Still unstable? Repeat lipid bolus${amount}`
    case "lastDoubleInfusion": return bg ? `Удвояване на липидната инфузия до 0,5 mL/kg/min${amount}` : `Double the lipid infusion to 0.5 mL/kg/min${amount}`
    case "lastMaximum": return bg ? `Липиди общо ${d.totalMl} mL: достигнат максимум 12 mL/kg (${d.maxMl} mL)` : `Lipid total ${d.totalMl} mL: the 12 mL/kg maximum (${d.maxMl} mL) is reached`
    case "anaphylaxisInfusion": return bg ? "Два болуса адреналин: започване на адреналинова инфузия?" : "Two adrenaline boluses: start an adrenaline infusion?"
    case "dantroleneRepeat": return bg
      ? `Все още признаци на МХ? Дантролен 1 mg/kg${amount} · общо ${d.totalMg} mg (${d.mgPerKg} mg/kg, ${d.vials} флакона)`
      : `Still signs of MH? Dantrolene 1 mg/kg${amount} · total ${d.totalMg} mg (${d.mgPerKg} mg/kg, ${d.vials} vials)`
    case "dantroleneMaximum": return bg ? `Дантролен ${d.mgPerKg} mg/kg: EMHG не определя горна граница; преоценка на диагнозата` : `Dantrolene ${d.mgPerKg} mg/kg: EMHG sets no hard maximum; reconsider the diagnosis`
    case "tourniquetWarning": return bg ? `Турникет ${d.minutes} min` : `Tourniquet ${d.minutes} min`
    case "tourniquetLimit": return bg ? `Турникет ${d.minutes} min: отпускане сега?` : `Tourniquet ${d.minutes} min: release now?`
    case "tourniquetStillOn": return bg ? "Турникетът още е надут: записване на отпускане?" : "Tourniquet still on: log Tourniquet off?"
  }
}
