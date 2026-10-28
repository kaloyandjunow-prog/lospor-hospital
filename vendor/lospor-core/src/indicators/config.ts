/**
 * The thresholds the unit indicators are counted against (10.0.0). Bundled
 * defaults below; a hospital changes them in Status. Only presentation: no
 * case records them, and a change re-reads every case.
 */

/** One age band and what counts as hypotension in it. A reading is hypotensive below either value set. */
export type HypotensionBand = {
  key: string
  labelEn: string
  labelBg: string
  /** Inclusive lower bound, in days of age. */
  fromDays: number
  /** Exclusive upper bound, in days of age; null for no upper bound. */
  toDays: number | null
  /** Mean arterial pressure below this (mmHg) is hypotension; null to not use MAP. */
  mapBelow: number | null
  /** Systolic pressure below this (mmHg) is hypotension; null to not use systolic. */
  sbpBelow: number | null
}

export type IndicatorConfig = {
  hypotensionBands: HypotensionBand[]
  /** SpO₂ below this (%) is desaturation. */
  spo2Below: number
  /** A temperature below this (°C), intraop or on arrival in recovery, is hypothermia. */
  tempBelow: number
  /** A recovery pain score above this (on 0–10 scales; NIPS 0–7) is moderate or severe pain. */
  painAbove: number
  /** PAED at or above this is emergence delirium. */
  paedAtLeast: number
  /**
   * Whether the per-anaesthesiologist figures carry colleagues' names. Off,
   * each user sees their own row named and colleagues as letters.
   */
  namedClinicians: boolean
}

const YEAR = 365.25
const years = (value: number) => Math.round(value * YEAR)

/**
 * The bundled defaults.
 *
 * Children: systolic hypotension as defined by Pediatric Advanced Life
 * Support (AHA 2020) — below 60 mmHg in term neonates, below 70 in infants,
 * below 70 + 2 × age in years from 1 to 10 (taken at each band's middle), and
 * below 90 from 10 years. Adults: MAP below 65 mmHg, the threshold associated
 * with organ injury in perioperative studies (Walsh 2013, Salmasi 2017).
 * Every value can be changed in Status.
 */
export const DEFAULT_HYPOTENSION_BANDS: readonly HypotensionBand[] = Object.freeze([
  { key: "NEONATE", labelEn: "Newborn (under 28 days)", labelBg: "Новородени (до 28 дни)", fromDays: 0, toDays: 28, mapBelow: null, sbpBelow: 60 },
  { key: "INFANT", labelEn: "Infant (28 days to 1 year)", labelBg: "Кърмачета (28 дни до 1 г.)", fromDays: 28, toDays: years(1), mapBelow: null, sbpBelow: 70 },
  { key: "CHILD_1_5", labelEn: "1 to 5 years", labelBg: "От 1 до 5 г.", fromDays: years(1), toDays: years(6), mapBelow: null, sbpBelow: 75 },
  { key: "CHILD_6_9", labelEn: "6 to 9 years", labelBg: "От 6 до 9 г.", fromDays: years(6), toDays: years(10), mapBelow: null, sbpBelow: 85 },
  { key: "ADOLESCENT", labelEn: "10 to 17 years", labelBg: "От 10 до 17 г.", fromDays: years(10), toDays: years(18), mapBelow: null, sbpBelow: 90 },
  { key: "ADULT", labelEn: "18 to 64 years", labelBg: "От 18 до 64 г.", fromDays: years(18), toDays: years(65), mapBelow: 65, sbpBelow: null },
  { key: "OLDER", labelEn: "65 years and over", labelBg: "65 и повече г.", fromDays: years(65), toDays: null, mapBelow: 65, sbpBelow: null },
])

export const DEFAULT_INDICATOR_CONFIG: IndicatorConfig = Object.freeze({
  hypotensionBands: DEFAULT_HYPOTENSION_BANDS as HypotensionBand[],
  spo2Below: 90,
  tempBelow: 36,
  painAbove: 3,
  paedAtLeast: 10,
  namedClinicians: false,
})

function finite(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null
}

/**
 * A configuration as stored or sent, checked; anything missing or out of
 * range falls back to the default for that value. Bands keep the bundled keys
 * and age ranges, so only their thresholds can change.
 */
export function parseIndicatorConfig(value: unknown): IndicatorConfig {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const stored = Array.isArray(input.hypotensionBands) ? input.hypotensionBands as Record<string, unknown>[] : []
  const hypotensionBands = DEFAULT_HYPOTENSION_BANDS.map(band => {
    const entry = stored.find(item => item && item.key === band.key)
    if (!entry) return { ...band }
    const mapBelow = entry.mapBelow === null ? null : finite(entry.mapBelow, 10, 150) ?? band.mapBelow
    const sbpBelow = entry.sbpBelow === null ? null : finite(entry.sbpBelow, 20, 200) ?? band.sbpBelow
    return { ...band, mapBelow, sbpBelow }
  })
  return {
    hypotensionBands,
    spo2Below: finite(input.spo2Below, 50, 100) ?? DEFAULT_INDICATOR_CONFIG.spo2Below,
    tempBelow: finite(input.tempBelow, 30, 38) ?? DEFAULT_INDICATOR_CONFIG.tempBelow,
    painAbove: finite(input.painAbove, 0, 9) ?? DEFAULT_INDICATOR_CONFIG.painAbove,
    paedAtLeast: finite(input.paedAtLeast, 1, 20) ?? DEFAULT_INDICATOR_CONFIG.paedAtLeast,
    namedClinicians: input.namedClinicians === true,
  }
}

/**
 * What a case's computed figures depend on in the configuration: a change to
 * any of these re-reads every case; the names switch alone does not.
 */
export function indicatorConfigKey(config: IndicatorConfig): string {
  return JSON.stringify([
    config.hypotensionBands.map(band => [band.key, band.mapBelow, band.sbpBelow]),
    config.spo2Below, config.tempBelow, config.painAbove, config.paedAtLeast,
  ])
}

/** The band a patient's age falls in; null when the age is unknown. */
export function hypotensionBandFor(config: IndicatorConfig, ageDays: number | null): HypotensionBand | null {
  if (ageDays == null || !Number.isFinite(ageDays) || ageDays < 0) return null
  return config.hypotensionBands.find(band => ageDays >= band.fromDays && (band.toDays == null || ageDays < band.toDays)) ?? null
}
