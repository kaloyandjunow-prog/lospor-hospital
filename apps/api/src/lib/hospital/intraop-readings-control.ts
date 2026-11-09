import type { PrismaClient } from "@/generated/prisma/client"
import {
  VITAL_SIGN_KEYS,
  VITAL_TAIL_STEPS,
  DEFAULT_VITAL_MIN_CASES,
  DEFAULT_VITAL_TAIL,
  MAX_VITAL_MIN_CASES,
  MIN_VITAL_MIN_CASES,
  type VitalBandKey,
  type VitalSignKey,
} from "@lospor/core/intraop-automation"
import {
  FIXED_HEART_RATE,
  HYPERTENSION_USES_STATISTICS,
  VITAL_BANDS,
  fixedHypotension,
  histogramPercentile,
  histogramReadings,
  type VitalHistogram,
  type VitalStatsTable,
} from "@lospor/core/vital-questions"
import { readIntraopAutomation, tallyTable, vitalStats, vitalStatsHistory } from "@/lib/intraop-automation"

/** Months of history the "how the limits moved" chart draws. */
export const READINGS_HISTORY_MONTHS = 24
/** The most recent finished cases per band the "who would be asked" figures are worked out from. */
export const READINGS_CASES_PER_BAND = 1_000
/** The order of the five numbers kept for each case. */
export const READINGS_CASE_COLUMNS = ["hrMin", "hrMax", "sbpMin", "dbpMin", "mapMin"] as const

const SIGNS: Record<VitalSignKey, { labelEn: string; labelBg: string; unit: string }> = {
  hr: { labelEn: "Heart rate", labelBg: "Пулс", unit: "bpm" },
  sbp: { labelEn: "Systolic pressure", labelBg: "Систолично налягане", unit: "mmHg" },
  dbp: { labelEn: "Diastolic pressure", labelBg: "Диастолично налягане", unit: "mmHg" },
  map: { labelEn: "Mean pressure", labelBg: "Средно налягане", unit: "mmHg" },
}

const DAY = 1
const YEAR_DAYS = 365

/** The fixed rules of one band, as Core states them: the heart-rate limits and the hypotension threshold's range. */
export function fixedRulesOf(band: (typeof VITAL_BANDS)[number]) {
  const first = fixedHypotension(band.fromDays)
  const lastDay = band.toDays == null ? band.fromDays + 40 * YEAR_DAYS : band.toDays - DAY
  const last = fixedHypotension(lastDay)
  return {
    tachycardiaAbove: FIXED_HEART_RATE[band.key].tachycardiaAbove,
    bradycardiaBelow: FIXED_HEART_RATE[band.key].bradycardiaBelow,
    hypotension: first && last ? { sign: first.sign, from: Math.min(first.below, last.below), to: Math.max(first.below, last.below) } : null,
  }
}

type CaseTuple = Array<number | null>

/** One finished case's five figures, from the per-value counts the tally kept for it. */
export function caseTuple(signs: Partial<Record<VitalSignKey, Record<string, number>>>): CaseTuple {
  const values = (sign: VitalSignKey) => Object.entries(signs[sign] ?? {}).filter(([, n]) => n > 0).map(([value]) => Number(value))
  const low = (sign: VitalSignKey) => { const all = values(sign); return all.length ? Math.min(...all) : null }
  const high = (sign: VitalSignKey) => { const all = values(sign); return all.length ? Math.max(...all) : null }
  return [low("hr"), high("hr"), low("sbp"), low("dbp"), low("map")]
}

const history = new Map<string, { at: number; value: ReturnType<typeof limitsHistory> }>()
const HISTORY_TTL_MS = 10 * 60_000

/** For each month and band and sign: the cases so far and the limit at each tail step, low and high. */
function limitsHistory(months: Array<{ month: string; stats: VitalStatsTable }>) {
  return months.map(({ month, stats }) => {
    const limits: Record<string, Record<string, { cases: number; low: Array<number | null>; high: Array<number | null> }>> = {}
    for (const band of VITAL_BANDS) {
      for (const sign of VITAL_SIGN_KEYS) {
        const histogram: VitalHistogram | undefined = stats[band.key]?.[sign]
        if (!histogram || histogramReadings(histogram) === 0) continue
        ;(limits[band.key] ??= {})[sign] = {
          cases: histogram.cases,
          low: VITAL_TAIL_STEPS.map(step => histogramPercentile(histogram, step)),
          high: VITAL_TAIL_STEPS.map(step => histogramPercentile(histogram, 100 - step)),
        }
      }
    }
    return { month, limits }
  })
}

/**
 * What the Status "Unusual readings" page works from (10.2.0): this hospital's readings as counts per value, per age
 * band and sign, each finished case's lowest and highest figures (so the page can say how many cases a limit would
 * ask about), and how the limits at every setting stood month by month. Counts and figures only: no case id, no
 * clinician, no time of day.
 */
export async function intraopReadingsControlView(db: PrismaClient, now = Date.now()) {
  const config = await readIntraopAutomation(db)

  // Bring the tally up to date for every institution first (the first read after an update counts the existing cases).
  const institutions = await db.institution.findMany({ select: { id: true } }).catch(() => [] as Array<{ id: string }>)
  for (const institution of institutions) await vitalStats(db, { institutionId: institution.id }, now).catch(() => null)

  const rows = await db.$queryRaw<Array<{ band: string; sign: string; value: number; count: number }>>`
    SELECT "band", "sign", "value", SUM("count")::int AS "count" FROM "VitalStatTally"
    WHERE "scopeKey" LIKE 'institution:%' AND "count" > 0 GROUP BY "band", "sign", "value"`
  const scope = await db.$queryRaw<Array<{ band: string; sign: string; cases: number }>>`
    SELECT "band", "sign", SUM("cases")::int AS "cases" FROM "VitalStatTallyScope"
    WHERE "scopeKey" LIKE 'institution:%' AND "cases" > 0 GROUP BY "band", "sign"`
  const stats = tallyTable(rows, scope)

  const perBand: Record<string, CaseTuple[]> = {}
  const contributions = await db.$queryRaw<Array<{ contribution: { band?: string; signs?: Partial<Record<VitalSignKey, Record<string, number>>> } | null }>>`
    SELECT "contribution" FROM "VitalStatTallyCase"
    WHERE "scopeKey" LIKE 'institution:%' AND "contribution" IS NOT NULL ORDER BY "talliedAt" DESC LIMIT ${READINGS_CASES_PER_BAND * VITAL_BANDS.length * 2}`
  for (const { contribution } of contributions) {
    if (!contribution?.band || !contribution.signs) continue
    const list = (perBand[contribution.band] ??= [])
    if (list.length < READINGS_CASES_PER_BAND) list.push(caseTuple(contribution.signs))
  }

  const cacheKey = "all"
  const cached = history.get(cacheKey)
  let months = cached && now - cached.at < HISTORY_TTL_MS ? cached.value : null
  if (!months) {
    months = limitsHistory(await vitalStatsHistory(db, {}, READINGS_HISTORY_MONTHS, new Date(now)).catch(() => []))
    history.set(cacheKey, { at: now, value: months })
  }

  return {
    generatedAt: new Date(now).toISOString(),
    config: {
      enabled: config.vitalQuestions.enabled,
      minCases: config.vitalQuestions.minCases,
      tails: config.vitalQuestions.tails,
      hypertensionBaselinePercent: config.vitalQuestions.hypertensionBaselinePercent,
    },
    /** True when a high blood-pressure limit asks a question; since 10.2.0 hypertension is judged on the baseline alone. */
    hypertensionUsesStatistics: HYPERTENSION_USES_STATISTICS,
    bands: VITAL_BANDS.map(band => ({ key: band.key, labelEn: band.labelEn, labelBg: band.labelBg, fixed: fixedRulesOf(band) })),
    signs: VITAL_SIGN_KEYS.map(key => ({ key, ...SIGNS[key] })),
    tailSteps: [...VITAL_TAIL_STEPS],
    defaultTail: DEFAULT_VITAL_TAIL,
    defaultMinCases: DEFAULT_VITAL_MIN_CASES,
    minCasesRange: { min: MIN_VITAL_MIN_CASES, max: MAX_VITAL_MIN_CASES },
    stats,
    caseColumns: [...READINGS_CASE_COLUMNS],
    cases: perBand,
    history: months,
  }
}

export type IntraopReadingsControlView = Awaited<ReturnType<typeof intraopReadingsControlView>>
export type { VitalBandKey }
