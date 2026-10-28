import type { TimetableData, VitalsEntry } from "../intraop-types"
import { INTRAOP_COLUMN_MINUTES } from "../intraop-engine"
import { calculateDeliveredFluidTotals, calcInfusionTotal } from "../intraop-totals"
import { idealBodyWeightKg } from "../dosing"
import { hypotensionBandFor, type IndicatorConfig } from "./config"
import { morphineEquivalents, opioidFactorFor, type OpioidDose } from "./opioids"
import { gasFootprint } from "./volatile"

/**
 * One case's contribution to the unit indicators (10.0.0), worked out once
 * from its record and kept until the case or the thresholds change. Plain
 * numbers and flags only: no free text, no identifiers beyond the theatre and
 * the anaesthesiologist the ward figures are grouped by.
 */
export const CASE_SUMMARY_VERSION = 3

export type CaseIndicatorSummary = {
  v: number
  startedAt: string
  endedAt: string | null
  durationMin: number | null
  /** Day of the week (0 Sunday) and hour, in the case's own timezone. */
  weekday: number
  hour: number
  mode: "ADULT" | "PEDIATRIC"
  ageBand: string | null
  ageYears: number | null
  asa: string | null
  procedure: string | null
  techniques: string[]
  apfel: number | null

  /** Minutes of the case covered by a blood pressure reading, and those below the band's threshold. */
  bpCoveredMin: number
  hypotensionMin: number
  spo2CoveredMin: number
  desaturationMin: number
  lowestTemp: number | null
  hypothermia: boolean | null

  /** Parenteral morphine equivalents (mg); null when no opioid was given. */
  morphineMg: number | null
  morphineMgPerKg: number | null
  neuraxialOpioid: boolean
  opioidsUnconverted: string[]
  drugs: string[]
  infusions: string[]
  sugammadex: boolean
  neostigmine: boolean
  /** Propofol infusion with no volatile agent. */
  tiva: boolean
  volatile: boolean
  antiemetics: number

  crystalloidMl: number
  crystalloidMlPerKgH: number | null
  colloidMl: number
  bloodMl: number
  transfused: boolean

  co2eKg: number | null
  agents: string[]
  nitrousOxide: boolean

  airwayDevice: string | null
  videoLaryngoscope: boolean
  cormackLehane: string | null
  airwayComplication: boolean

  complications: string[]

  painScale: "NRS" | "FLACC" | "NIPS" | "FPS_R" | null
  painScore: number | null
  painAboveThreshold: boolean | null
  ponv: boolean | null
  paedScore: number | null
  emergenceDelirium: boolean | null
  /** The recovery score and its scale: Aldrete (0-10) for adults, Steward (0-6) for children. */
  recoveryScore: number | null
  recoveryScale: "ALDRETE" | "STEWARD" | null
  disposition: string | null

  status: string
  finalizedLagMin: number | null
  autoEnded: boolean
  missing: string[]
}

export type CaseIndicatorInput = {
  status: string
  clinicalMode: "ADULT" | "PEDIATRIC"
  startedAt: Date
  endedAt: Date | null
  timezone: string | null
  finalizedAt: Date | null
  autoEndedAt: Date | null
  ageDays: number | null
  sex: string | null
  weightKg: number | null
  heightCm: number | null
  asa: string | null
  apfel: number | null
  procedure: string | null
  techniques: string[]
  airwayDevice: string | null
  airwayTools: string[]
  cormackLehane: string | null
  complications: string[]
  postop: {
    painNRS: number | null
    flaccTotal: number | null
    nipsTotal: number | null
    fpsrScore: number | null
    ponv: boolean | null
    paedScore: number | null
    aldreteTotal: number | null
    stewardTotal: number | null
    temperature: number | null
    disposition: string | null
  } | null
  timetable: TimetableData
  /** Finalisation issue codes, for a case not yet finalised. */
  missing: string[]
}

const ANTIEMETICS = /ondansetron|granisetron|tropisetron|palonosetron|dexamethasone|droperidol|haloperidol|metoclopramide|dimenhydrinate|cyclizine|aprepitant|fosaprepitant|promethazine|scopolamine|hyoscine|amisulpride/i
const AIRWAY_COMPLICATIONS = /laryngospasm|bronchospasm|aspiration|hypoxia|desaturation/i

function meanArterial(entry: VitalsEntry | undefined): number | null {
  return entry?.systolic != null && entry.diastolic != null ? (entry.systolic + 2 * entry.diastolic) / 3 : null
}

/** A reading stands for its own column and, until the next one, up to two more (15 minutes). */
const CARRY_COLUMNS = 2

function minutesBelow(
  vitals: readonly (VitalsEntry | undefined)[],
  lastColumn: number,
  has: (entry: VitalsEntry) => boolean,
  below: (entry: VitalsEntry) => boolean,
): { covered: number; below: number } {
  let covered = 0
  let low = 0
  let current: VitalsEntry | null = null
  let age = 0
  for (let column = 0; column <= lastColumn; column += 1) {
    const entry = vitals[column]
    if (entry && has(entry)) { current = entry; age = 0 } else if (current) age += 1
    if (!current || age > CARRY_COLUMNS) continue
    covered += INTRAOP_COLUMN_MINUTES
    if (below(current)) low += INTRAOP_COLUMN_MINUTES
  }
  return { covered, below: low }
}

function localParts(date: Date, timezone: string | null): { weekday: number; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone ?? "Europe/Sofia", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(date)
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find(part => part.type === "weekday")?.value ?? "")
    const hour = Number(parts.find(part => part.type === "hour")?.value) % 24
    return { weekday: weekday < 0 ? date.getUTCDay() : weekday, hour: Number.isFinite(hour) ? hour : date.getUTCHours() }
  } catch {
    return { weekday: date.getUTCDay(), hour: date.getUTCHours() }
  }
}

function round(value: number, places = 1): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

export function summarizeCaseIndicators(input: CaseIndicatorInput, config: IndicatorConfig): CaseIndicatorSummary {
  const { timetable } = input
  const end = input.endedAt ?? null
  const durationMin = end ? Math.max(0, Math.round((end.getTime() - input.startedAt.getTime()) / 60_000)) : null
  const lastColumn = Math.max(0, durationMin != null ? Math.ceil(durationMin / INTRAOP_COLUMN_MINUTES) - 1 : timetable.vitals.length - 1)
  const band = hypotensionBandFor(config, input.ageDays)

  const bp = minutesBelow(
    timetable.vitals,
    lastColumn,
    entry => entry.systolic != null,
    entry => {
      const map = meanArterial(entry)
      return !!band && ((band.mapBelow != null && map != null && map < band.mapBelow)
        || (band.sbpBelow != null && entry.systolic != null && entry.systolic < band.sbpBelow))
    },
  )
  const spo2 = minutesBelow(timetable.vitals, lastColumn, entry => entry.spO2 != null, entry => (entry.spO2 ?? 100) < config.spo2Below)
  const temps = [
    ...timetable.vitals.map(entry => entry?.temp).filter((value): value is number => value != null && Number.isFinite(value)),
    ...(input.postop?.temperature != null ? [input.postop.temperature] : []),
  ]
  const lowestTemp = temps.length ? Math.min(...temps) : null

  // Opioids: boluses, and infusions as the chart totals them.
  const ibw = idealBodyWeightKg(input.heightCm, input.sex)
  const doses: OpioidDose[] = timetable.drugs
    .filter(drug => !drug.planned)
    .map(drug => ({ name: drug.name, amount: Number(drug.dose), unit: drug.unit, route: drug.route }))
  for (const infusion of timetable.infusions) {
    if (infusion.planned || !opioidFactorFor(infusion.name)) continue
    const total = calcInfusionTotal(infusion, ibw, input.weightKg)
    if (!total.weightMissing) doses.push({ name: infusion.name, amount: total.amount, unit: total.unit, route: (infusion as { route?: string }).route })
  }
  const opioids = morphineEquivalents(doses)
  const drugNames = [...new Set(timetable.drugs.filter(drug => !drug.planned).map(drug => drug.name))]
  const infusionNames = [...new Set(timetable.infusions.filter(infusion => !infusion.planned).map(infusion => infusion.name))]
  const all = [...drugNames, ...infusionNames]
  const volatile = timetable.agents.some(agent => !agent.planned)

  const fluids = calculateDeliveredFluidTotals(timetable.fluids, end ?? new Date(input.startedAt.getTime() + (lastColumn + 1) * INTRAOP_COLUMN_MINUTES * 60_000))
  const hours = durationMin && durationMin > 0 ? durationMin / 60 : null
  const footprint = gasFootprint(timetable.agents, timetable.gasSettings ?? [])

  const postop = input.postop
  const pain: [CaseIndicatorSummary["painScale"], number | null] =
    postop?.painNRS != null ? ["NRS", postop.painNRS]
      : postop?.flaccTotal != null ? ["FLACC", postop.flaccTotal]
        : postop?.nipsTotal != null ? ["NIPS", postop.nipsTotal]
          : postop?.fpsrScore != null ? ["FPS_R", postop.fpsrScore]
            : [null, null]
  const local = localParts(input.startedAt, input.timezone)
  const finalizedLagMin = input.finalizedAt && end ? Math.max(0, Math.round((input.finalizedAt.getTime() - end.getTime()) / 60_000)) : null

  return {
    v: CASE_SUMMARY_VERSION,
    startedAt: input.startedAt.toISOString(),
    endedAt: end?.toISOString() ?? null,
    durationMin,
    weekday: local.weekday,
    hour: local.hour,
    mode: input.clinicalMode,
    ageBand: band?.key ?? null,
    ageYears: input.ageDays != null ? Math.floor(input.ageDays / 365.25) : null,
    asa: input.asa,
    procedure: input.procedure?.trim() || null,
    techniques: input.techniques,
    apfel: input.apfel,

    bpCoveredMin: bp.covered,
    hypotensionMin: bp.below,
    spo2CoveredMin: spo2.covered,
    desaturationMin: spo2.below,
    lowestTemp,
    hypothermia: lowestTemp == null ? null : lowestTemp < config.tempBelow,

    morphineMg: opioids.given ? opioids.mg : null,
    morphineMgPerKg: opioids.given && input.weightKg ? round(opioids.mg / input.weightKg, 3) : null,
    neuraxialOpioid: opioids.neuraxial,
    opioidsUnconverted: opioids.unconverted,
    drugs: drugNames,
    infusions: infusionNames,
    sugammadex: all.some(name => /sugammadex/i.test(name)),
    neostigmine: all.some(name => /neostigmine/i.test(name)),
    tiva: !volatile && infusionNames.some(name => /propofol/i.test(name)),
    volatile,
    antiemetics: new Set(all.filter(name => ANTIEMETICS.test(name)).map(name => name.toLowerCase())).size,

    crystalloidMl: fluids.crystalloids,
    crystalloidMlPerKgH: input.weightKg && hours ? round(fluids.crystalloids / input.weightKg / hours, 2) : null,
    colloidMl: fluids.colloids,
    bloodMl: fluids.blood,
    transfused: fluids.blood > 0 || timetable.fluids.some(fluid => !fluid.planned && fluid.category === "Blood products"),

    co2eKg: footprint.kgCo2e,
    agents: footprint.agents,
    nitrousOxide: footprint.nitrousOxide,

    airwayDevice: input.airwayDevice,
    videoLaryngoscope: input.airwayTools.includes("VIDEO_LARY"),
    cormackLehane: input.cormackLehane,
    airwayComplication: input.complications.some(label => AIRWAY_COMPLICATIONS.test(label)),

    complications: input.complications,

    painScale: pain[0],
    painScore: pain[1],
    painAboveThreshold: pain[1] == null ? null : pain[1] > config.painAbove,
    ponv: postop?.ponv ?? null,
    paedScore: postop?.paedScore ?? null,
    emergenceDelirium: postop?.paedScore == null ? null : postop.paedScore >= config.paedAtLeast,
    // The two scales are never pooled: a median across 0-10 and 0-6 means nothing.
    recoveryScore: postop?.aldreteTotal ?? postop?.stewardTotal ?? null,
    recoveryScale: postop?.aldreteTotal != null ? "ALDRETE" : postop?.stewardTotal != null ? "STEWARD" : null,
    disposition: postop?.disposition ?? null,

    status: input.status,
    finalizedLagMin,
    autoEnded: input.autoEndedAt != null,
    missing: input.status === "COMPLETE" ? [] : input.missing,
  }
}
