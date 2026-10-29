import type { IndicatorConfig } from "./config"
import type { CaseIndicatorSummary } from "./case-summary"

/**
 * The unit indicators (10.0.0): case summaries in, the figures each section
 * shows out. Any figure resting on fewer than SUPPRESS_BELOW cases is given
 * as null ("fewer than 5"): too few to judge practice by, and too few to keep
 * a patient out of sight.
 */
export const SUPPRESS_BELOW = 5

/** A case summary with what the ward figures are grouped by. */
export type IndicatorRow = CaseIndicatorSummary & {
  caseId: string
  theatreId: string | null
  theatreName: string | null
  assigneeId: string
}

/** A share of cases: `of` the cases it is out of, `share` 0–1, null when too few. */
export type Share = { count: number | null; of: number; share: number | null }
/** A spread: median and quartiles, null when too few. */
export type Spread = { n: number; median: number | null; q1: number | null; q3: number | null }
export type Tally = { key: string; count: number | null }

export type ClinicianOpioids = {
  /** The name, when names are shown or it is the viewer; otherwise null and `letter` stands for it. */
  name: string | null
  letter: string
  isMe: boolean
  cases: number
  morphineMg: Spread
  morphineMgPerKg: Spread
}

export type HypotensionByBand = {
  band: string
  cases: number
  withHypotension: Share
  /** Minutes per case below the threshold. */
  minutes: Spread
  /** All minutes below, and the share of monitored time they were. */
  totalMinutes: number | null
  shareOfMonitoredTime: number | null
}

export type IndicatorsReport = {
  cases: number
  suppressBelow: number
  activity: {
    byMonth: Tally[]
    byWeek: Tally[]
    byMode: Tally[]
    byTechnique: Tally[]
    /** [weekday 0–6][hour 0–23] case starts; null where fewer than 5. */
    heatmap: (number | null)[][]
    byTheatre: { id: string | null; name: string | null; cases: number | null; hours: number | null }[]
    /** Procedures cancelled before anaesthesia (10.0.0), against all scheduled (started + cancelled). */
    cancelled: Share
    cancellationReasons: Tally[]
  }
  time: {
    duration: Spread
    durationByProcedure: { procedure: string; duration: Spread }[]
    turnover: Spread
    turnoverByTheatre: { id: string; name: string | null; turnover: Spread }[]
  }
  caseMix: {
    ageBands: Tally[]
    asa: Tally[]
    apfel: Tally[]
    pediatric: Share
  }
  airway: {
    devices: Tally[]
    videoLaryngoscope: Share
    cormackLehane3or4: Share
    airwayComplications: Share
  }
  drugs: {
    topDrugs: Tally[]
    topInfusions: Tally[]
    morphineMg: Spread
    morphineMgPerKg: Spread
    opioidCases: Share
    neuraxialOpioid: Share
    byClinician: ClinicianOpioids[]
    sugammadex: Share
    neostigmine: Share
    tiva: Share
    volatile: Share
    /** Apfel 3–4 patients given two antiemetics or more. */
    ponvProphylaxisHighRisk: Share
  }
  environment: {
    totalKgCo2e: number | null
    kgCo2ePerCase: Spread
    casesWithEstimate: number
    agents: Tally[]
    nitrousOxide: Share
    desflurane: Share
  }
  fluids: {
    crystalloidMlPerKgH: Spread
    transfused: Share
  }
  intraopEvents: {
    hypotension: HypotensionByBand[]
    desaturation: Share
    desaturationMinutes: Spread
    hypothermia: Share
    complicationsPer100: number | null
    topComplications: Tally[]
  }
  recovery: {
    painAboveThreshold: Share
    painByScale: { scale: string; aboveThreshold: Share }[]
    ponv: Share
    /** Observed PONV by Apfel score, against what the score predicts (Apfel 1999). */
    ponvByApfel: { apfel: number; observed: Share; predicted: number }[]
    emergenceDelirium: Share
    /** Each recovery score on its own scale: Aldrete 0-10, Steward 0-6. */
    aldreteScore: Spread
    stewardScore: Spread
    icu: Share
  }
  documentation: {
    finalised: Share
    hoursToFinalise: Spread
    awaitingReview: number | null
    autoEnded: Share
    topMissing: Tally[]
  }
}

/** Apfel 1999: predicted PONV incidence by number of risk factors. */
export const APFEL_PREDICTED: Readonly<Record<number, number>> = { 0: 0.1, 1: 0.21, 2: 0.39, 3: 0.61, 4: 0.79 }

function hidden(count: number): number | null {
  return count > 0 && count < SUPPRESS_BELOW ? null : count
}

export function share(count: number, of: number): Share {
  if (of < SUPPRESS_BELOW) return { count: null, of, share: null }
  return { count, of, share: Math.round((count / of) * 1000) / 1000 }
}

function quantile(sorted: number[], q: number): number {
  const position = (sorted.length - 1) * q
  const low = Math.floor(position)
  const high = Math.ceil(position)
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
}

export function spread(values: readonly (number | null | undefined)[]): Spread {
  const sorted = values.filter((value): value is number => value != null && Number.isFinite(value)).sort((left, right) => left - right)
  if (sorted.length < SUPPRESS_BELOW) return { n: sorted.length, median: null, q1: null, q3: null }
  const fix = (value: number) => Math.round(value * 100) / 100
  return { n: sorted.length, median: fix(quantile(sorted, 0.5)), q1: fix(quantile(sorted, 0.25)), q3: fix(quantile(sorted, 0.75)) }
}

function tally(keys: readonly (string | null | undefined)[], limit?: number): Tally[] {
  const counts = new Map<string, number>()
  for (const key of keys) if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  const sorted = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  return (limit ? sorted.slice(0, limit) : sorted).map(([key, count]) => ({ key, count: hidden(count) }))
}

function isoWeek(iso: string): string {
  const date = new Date(iso)
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = day.getUTCDay() || 7
  day.setUTCDate(day.getUTCDate() + 4 - weekday)
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

/** Minutes from one case's end to the next start in the same theatre, the same day; gaps over 4 hours are not turnover. */
function turnovers(rows: readonly IndicatorRow[]): Map<string, number[]> {
  const byTheatre = new Map<string, IndicatorRow[]>()
  for (const row of rows) {
    if (!row.theatreId) continue
    byTheatre.set(row.theatreId, [...(byTheatre.get(row.theatreId) ?? []), row])
  }
  const result = new Map<string, number[]>()
  for (const [theatreId, list] of byTheatre) {
    const sorted = [...list].sort((left, right) => left.startedAt.localeCompare(right.startedAt))
    const gaps: number[] = []
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]
      if (!previous.endedAt) continue
      const gap = (Date.parse(sorted[index].startedAt) - Date.parse(previous.endedAt)) / 60_000
      if (gap > 0 && gap <= 240 && sorted[index].startedAt.slice(0, 10) === previous.startedAt.slice(0, 10)) gaps.push(Math.round(gap))
    }
    result.set(theatreId, gaps)
  }
  return result
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const letterFor = (index: number) => index < 26 ? LETTERS[index] : `${LETTERS[Math.floor(index / 26) - 1]}${LETTERS[index % 26]}`

export function aggregateIndicators(
  rows: readonly IndicatorRow[],
  options: {
    config: IndicatorConfig
    viewerId: string
    names: Readonly<Record<string, string>>
    /** The reasons of the procedures cancelled in the period (10.0.0). */
    cancellations?: readonly string[]
  },
): IndicatorsReport {
  const cancellations = options.cancellations ?? []
  const n = rows.length
  const count = (test: (row: IndicatorRow) => boolean, of: readonly IndicatorRow[] = rows) => share(of.filter(test).length, of.length)

  // Activity
  const heatmap: (number | null)[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const row of rows) (heatmap[row.weekday][row.hour] as number) += 1
  for (const line of heatmap) for (let hour = 0; hour < 24; hour += 1) line[hour] = hidden(line[hour] as number)
  const theatres = new Map<string, { id: string | null; name: string | null; cases: number; minutes: number }>()
  for (const row of rows) {
    const key = row.theatreId ?? ""
    const entry = theatres.get(key) ?? { id: row.theatreId, name: row.theatreName, cases: 0, minutes: 0 }
    entry.cases += 1
    entry.minutes += row.durationMin ?? 0
    theatres.set(key, entry)
  }

  // Time
  const byProcedure = new Map<string, number[]>()
  for (const row of rows) if (row.procedure && row.durationMin != null) byProcedure.set(row.procedure, [...(byProcedure.get(row.procedure) ?? []), row.durationMin])
  const gaps = turnovers(rows)

  // Drugs, per anaesthesiologist
  const byClinician = new Map<string, IndicatorRow[]>()
  for (const row of rows) byClinician.set(row.assigneeId, [...(byClinician.get(row.assigneeId) ?? []), row])
  const clinicianIds = [...byClinician.keys()].sort()
  const clinicians: ClinicianOpioids[] = clinicianIds
    .map((id, index) => {
      const list = byClinician.get(id)!
      const isMe = id === options.viewerId
      return {
        name: options.config.namedClinicians || isMe ? options.names[id] ?? null : null,
        letter: letterFor(index),
        isMe,
        cases: list.length,
        morphineMg: spread(list.map(row => row.morphineMg)),
        morphineMgPerKg: spread(list.map(row => row.morphineMgPerKg)),
      }
    })
    .filter(entry => entry.cases >= SUPPRESS_BELOW || entry.isMe)
    .sort((left, right) => (left.morphineMgPerKg.median ?? Infinity) - (right.morphineMgPerKg.median ?? Infinity))

  // Intraop events
  const hypotension: HypotensionByBand[] = options.config.hypotensionBands.map(band => {
    const list = rows.filter(row => row.ageBand === band.key && row.bpCoveredMin > 0)
    const total = list.reduce((sum, row) => sum + row.hypotensionMin, 0)
    const covered = list.reduce((sum, row) => sum + row.bpCoveredMin, 0)
    const enough = list.length >= SUPPRESS_BELOW
    return {
      band: band.key,
      cases: list.length,
      withHypotension: share(list.filter(row => row.hypotensionMin > 0).length, list.length),
      minutes: spread(list.map(row => row.hypotensionMin)),
      totalMinutes: enough ? total : null,
      shareOfMonitoredTime: enough && covered > 0 ? Math.round((total / covered) * 1000) / 1000 : null,
    }
  })
  const monitoredSpo2 = rows.filter(row => row.spo2CoveredMin > 0)
  const complicationCount = rows.reduce((sum, row) => sum + row.complications.length, 0)

  // Recovery
  const withPain = rows.filter(row => row.painAboveThreshold != null)
  const scales = [...new Set(withPain.map(row => row.painScale!))]
  const withPonv = rows.filter(row => row.ponv != null)
  const highRisk = rows.filter(row => row.apfel != null && row.apfel >= 3)
  const footprints = rows.filter(row => row.co2eKg != null && (row.agents.length > 0 || row.nitrousOxide))

  // Documentation
  const ended = rows.filter(row => row.endedAt)

  return {
    cases: n,
    suppressBelow: SUPPRESS_BELOW,
    activity: {
      byMonth: tally(rows.map(row => row.startedAt.slice(0, 7))).sort((left, right) => left.key.localeCompare(right.key)),
      byWeek: tally(rows.map(row => isoWeek(row.startedAt))).sort((left, right) => left.key.localeCompare(right.key)),
      byMode: tally(rows.map(row => row.mode)),
      byTechnique: tally(rows.flatMap(row => row.techniques)),
      heatmap,
      byTheatre: [...theatres.values()].sort((left, right) => right.cases - left.cases).map(entry => ({
        id: entry.id,
        name: entry.name,
        cases: hidden(entry.cases),
        hours: entry.cases < SUPPRESS_BELOW ? null : Math.round(entry.minutes / 6) / 10,
      })),
      cancelled: share(cancellations.length, cancellations.length + n),
      cancellationReasons: tally(cancellations),
    },
    time: {
      duration: spread(rows.map(row => row.durationMin)),
      durationByProcedure: [...byProcedure.entries()]
        .filter(([, list]) => list.length >= SUPPRESS_BELOW)
        .sort((left, right) => right[1].length - left[1].length)
        .slice(0, 15)
        .map(([procedure, list]) => ({ procedure, duration: spread(list) })),
      turnover: spread([...gaps.values()].flat()),
      turnoverByTheatre: [...gaps.entries()]
        .filter(([, list]) => list.length >= SUPPRESS_BELOW)
        .map(([id, list]) => ({ id, name: theatres.get(id)?.name ?? null, turnover: spread(list) })),
    },
    caseMix: {
      ageBands: tally(rows.map(row => row.ageBand)),
      asa: tally(rows.map(row => row.asa)).sort((left, right) => left.key.localeCompare(right.key)),
      apfel: tally(rows.map(row => row.apfel == null ? null : String(row.apfel))).sort((left, right) => left.key.localeCompare(right.key)),
      pediatric: count(row => row.mode === "PEDIATRIC"),
    },
    airway: {
      devices: tally(rows.map(row => row.airwayDevice)),
      videoLaryngoscope: count(row => row.videoLaryngoscope, rows.filter(row => row.airwayDevice)),
      cormackLehane3or4: count(row => row.cormackLehane === "III" || row.cormackLehane === "IV", rows.filter(row => row.cormackLehane)),
      airwayComplications: count(row => row.airwayComplication),
    },
    drugs: {
      topDrugs: tally(rows.flatMap(row => row.drugs), 15),
      topInfusions: tally(rows.flatMap(row => row.infusions), 10),
      morphineMg: spread(rows.map(row => row.morphineMg)),
      morphineMgPerKg: spread(rows.map(row => row.morphineMgPerKg)),
      opioidCases: count(row => row.morphineMg != null),
      neuraxialOpioid: count(row => row.neuraxialOpioid),
      byClinician: clinicians,
      sugammadex: count(row => row.sugammadex),
      neostigmine: count(row => row.neostigmine),
      tiva: count(row => row.tiva),
      volatile: count(row => row.volatile),
      ponvProphylaxisHighRisk: count(row => row.antiemetics >= 2, highRisk),
    },
    environment: {
      totalKgCo2e: footprints.length >= SUPPRESS_BELOW ? Math.round(footprints.reduce((sum, row) => sum + (row.co2eKg ?? 0), 0) * 10) / 10 : null,
      kgCo2ePerCase: spread(footprints.map(row => row.co2eKg)),
      casesWithEstimate: footprints.length,
      agents: tally(rows.flatMap(row => row.agents)),
      nitrousOxide: count(row => row.nitrousOxide),
      desflurane: count(row => row.agents.includes("desflurane")),
    },
    fluids: {
      crystalloidMlPerKgH: spread(rows.map(row => row.crystalloidMlPerKgH)),
      transfused: count(row => row.transfused),
    },
    intraopEvents: {
      hypotension,
      desaturation: count(row => row.desaturationMin > 0, monitoredSpo2),
      desaturationMinutes: spread(monitoredSpo2.filter(row => row.desaturationMin > 0).map(row => row.desaturationMin)),
      hypothermia: count(row => row.hypothermia === true, rows.filter(row => row.hypothermia != null)),
      complicationsPer100: n >= SUPPRESS_BELOW ? Math.round((complicationCount / n) * 1000) / 10 : null,
      topComplications: tally(rows.flatMap(row => row.complications), 10),
    },
    recovery: {
      painAboveThreshold: count(row => row.painAboveThreshold === true, withPain),
      painByScale: scales.map(scale => ({ scale, aboveThreshold: count(row => row.painAboveThreshold === true, withPain.filter(row => row.painScale === scale)) })),
      ponv: count(row => row.ponv === true, withPonv),
      ponvByApfel: [0, 1, 2, 3, 4].map(apfel => ({
        apfel,
        observed: count(row => row.ponv === true, withPonv.filter(row => row.apfel === apfel)),
        predicted: APFEL_PREDICTED[apfel],
      })),
      emergenceDelirium: count(row => row.emergenceDelirium === true, rows.filter(row => row.emergenceDelirium != null)),
      aldreteScore: spread(rows.filter(row => row.recoveryScale === "ALDRETE").map(row => row.recoveryScore)),
      stewardScore: spread(rows.filter(row => row.recoveryScale === "STEWARD").map(row => row.recoveryScore)),
      icu: count(row => row.disposition === "ICU", rows.filter(row => row.disposition)),
    },
    documentation: {
      finalised: count(row => row.status === "COMPLETE", ended),
      hoursToFinalise: spread(rows.map(row => row.finalizedLagMin == null ? null : row.finalizedLagMin / 60)),
      awaitingReview: hidden(rows.filter(row => row.status === "AWAITING_REVIEW").length),
      autoEnded: count(row => row.autoEnded),
      topMissing: tally(rows.flatMap(row => row.missing), 10),
    },
  }
}
