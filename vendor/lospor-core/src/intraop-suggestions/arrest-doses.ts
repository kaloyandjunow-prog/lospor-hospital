import type { LogEvent } from "../intraop-types"
import { applyIntraopEventOps, type IntraopEventOps } from "../intraop-timetable-edit"
import { isChild, type SuggestionPatient } from "./context"

/**
 * Drugs given during a cardiac arrest, charted afterwards (10.2.0).
 *
 * Nobody stops CPR to chart a dose. On the arrest card each Give writes one
 * dose straight away (so a closed app loses nothing), marked
 * `timeApproximate`, at a provisional time: the arrest start plus one interval
 * per dose already given. When ROSC or Death ends the arrest, the doses are
 * spread evenly across it, at most one interval apart. The time stays marked
 * approximate in the record and in the export.
 */

export const ARREST_DOSE_INTERVAL_MINUTES = 5
const MIN = 60_000
const ARREST_LABEL = "Cardiac arrest"
const ARREST_ENDS: ReadonlySet<string> = new Set(["ROSC", "Death (exitus letalis)"])
const isClinical = (event: LogEvent, labels: ReadonlySet<string>) => event.type === "clinical_event" && labels.has(event.label ?? "")

export type ArrestDrug = "Epinephrine / Adrenaline" | "Amiodarone"

const ms = (value: Date | string | number) => new Date(value).getTime()
const iso = (value: number) => new Date(value).toISOString()

/** The arrest doses already charted this way, in the order they were given. */
export function approximateArrestDoses(log: readonly LogEvent[], arrest: LogEvent, drug: ArrestDrug): LogEvent[] {
  const prefix = `arrest-dose-${drugKey(drug)}-${arrest.id}-`
  return log
    .filter(event => event.type === "drug" && event.name === drug && event.timeApproximate === true && typeof event.id === "string" && event.id.startsWith(prefix))
    .sort((a, b) => doseIndex(a.id) - doseIndex(b.id))
}

const drugKey = (drug: ArrestDrug) => (drug === "Amiodarone" ? "amiodarone" : "adrenaline")
const doseIndex = (id: string | undefined) => Number(id?.split("-").pop()) || 0

/** The dose for the next tap: adrenaline 1 mg (10 mcg/kg, max 1 mg, in a child); amiodarone 300 mg then 150 mg (5 mg/kg in a child). */
export function nextArrestDose(drug: ArrestDrug, given: number, patient: SuggestionPatient): { amount: number; unit: "mcg" | "mg" } | null {
  const child = isChild(patient)
  if (drug === "Epinephrine / Adrenaline") {
    if (!child) return { amount: 1000, unit: "mcg" }
    return patient.weightKg ? { amount: Math.min(1000, Math.round(patient.weightKg * 10)), unit: "mcg" } : null
  }
  if (!child) return { amount: given === 0 ? 300 : 150, unit: "mg" }
  return patient.weightKg ? { amount: Math.round(patient.weightKg * 5), unit: "mg" } : null
}

/**
 * When this arrest ended: its first ROSC or Death at or after it and before any later arrest, or null while it goes
 * on. A ROSB does not end it.
 */
export function arrestEndedAt(log: readonly LogEvent[], arrest: LogEvent): string | null {
  const start = ms(arrest.ts)
  const nextArrest = log
    .filter(event => event.id !== arrest.id && (event.type === "complication" || event.type === "clinical_event") && event.label === ARREST_LABEL && ms(event.ts) > start)
    .reduce<number>((soonest, event) => Math.min(soonest, ms(event.ts)), Infinity)
  const end = log
    .filter(event => isClinical(event, ARREST_ENDS) && ms(event.ts) >= start && ms(event.ts) < nextArrest)
    .sort((a, b) => ms(a.ts) - ms(b.ts))[0]
  return end ? end.ts : null
}

/** One tap on Give during an arrest: the next dose, written now, at its provisional time. */
export function arrestQuickDoseOps(
  log: readonly LogEvent[],
  arrest: LogEvent,
  drug: ArrestDrug,
  patient: SuggestionPatient,
  now: Date | string | number,
  suggestion?: string,
): IntraopEventOps {
  const given = approximateArrestDoses(log, arrest, drug).length
  const dose = nextArrestDose(drug, given, patient)
  if (!dose) return { add: [], update: [], remove: [] }
  // Amiodarone half a minute after the adrenaline slot, so two drugs never share one instant.
  const offset = drug === "Amiodarone" ? MIN / 2 : 0
  const at = Math.min(ms(now), ms(arrest.ts) + given * ARREST_DOSE_INTERVAL_MINUTES * MIN + offset)
  const added: LogEvent = {
    id: `arrest-dose-${drugKey(drug)}-${arrest.id}-${given + 1}`,
    ts: iso(at),
    type: "drug",
    name: drug,
    dose: String(dose.amount),
    unit: dose.unit,
    drugRoute: "IV",
    timeApproximate: true,
    ...(suggestion ? { suggestion } : {}),
    recordedAt: iso(ms(now)),
  }
  // Charted after ROSC or Death was already logged: the doses belong inside the arrest, so spread them to its end now
  // (the ending event will not be logged again to do it).
  const ended = arrestEndedAt(log, arrest)
  if (ended == null) return { add: [added], update: [], remove: [] }
  const respaced = arrestRespaceOps([...log, added], arrest, ended).update
  const mine = respaced.find(event => event.id === added.id)
  return { add: [mine ?? added], update: respaced.filter(event => event.id !== added.id), remove: [] }
}

/** When the arrest ends: each drug's doses spread evenly from its start to the end, at most one interval apart. */
export function arrestRespaceOps(log: readonly LogEvent[], arrest: LogEvent, endedAt: Date | string | number): IntraopEventOps {
  const start = ms(arrest.ts)
  const end = ms(endedAt)
  const update: LogEvent[] = []
  for (const drug of ["Epinephrine / Adrenaline", "Amiodarone"] as const) {
    const doses = approximateArrestDoses(log, arrest, drug)
    if (doses.length === 0 || !(end > start)) continue
    const interval = Math.min(ARREST_DOSE_INTERVAL_MINUTES * MIN, (end - start) / doses.length)
    const offset = drug === "Amiodarone" ? Math.min(MIN / 2, interval / 2) : 0
    doses.forEach((dose, index) => {
      const ts = iso(Math.round(start + index * interval + offset))
      if (dose.ts !== ts) update.push({ ...dose, ts })
    })
  }
  return { add: [], update, remove: [] }
}


/** The arrest an ending event closes: the latest arrest before it with no other ROSC or Death in between. */
function arrestClosedBy(log: readonly LogEvent[], end: LogEvent): LogEvent | null {
  const endAt = ms(end.ts)
  const arrests = log.filter(event => (event.type === "complication" || event.type === "clinical_event") && event.label === ARREST_LABEL && ms(event.ts) <= endAt).sort((a, b) => ms(b.ts) - ms(a.ts))
  const arrest = arrests[0]
  if (!arrest) return null
  const closedEarlier = log.some(event => event.id !== end.id && isClinical(event, ARREST_ENDS) && ms(event.ts) >= ms(arrest.ts) && ms(event.ts) < endAt)
  return closedEarlier ? null : arrest
}

/**
 * ROSC or Death logged anywhere (the timeline, the event list, the card): the doses tapped during that arrest are
 * spread across it. `before` and `after` are the log either side of the change; the result is applied to `after`.
 * Only a newly logged or re-timed ending counts, so a plain re-save moves nothing.
 */
export function arrestEndRespace(before: readonly LogEvent[], after: readonly LogEvent[]): IntraopEventOps {
  const previous = new Map(before.map(event => [event.id, event]))
  const update = new Map<string, LogEvent>()
  for (const end of after.filter(event => isClinical(event, ARREST_ENDS))) {
    const was = end.id ? previous.get(end.id) : undefined
    if (was && was.ts === end.ts && was.label === end.label) continue
    const arrest = arrestClosedBy(after, end)
    if (!arrest) continue
    for (const dose of arrestRespaceOps(after, arrest, end.ts).update) if (dose.id) update.set(dose.id, dose)
  }
  return { add: [], update: [...update.values()], remove: [] }
}

/** The ops with any re-spreading their ROSC or Death calls for added in (an update the ops already carry wins). */
export function withArrestEndRespace(log: readonly LogEvent[], ops: IntraopEventOps): IntraopEventOps {
  const extra = arrestEndRespace(log, applyIntraopEventOps([...log], ops)).update
  const carried = new Set(ops.update.map(event => event.id))
  const added = extra.filter(event => !carried.has(event.id))
  return added.length ? { ...ops, update: [...ops.update, ...added] } : ops
}
