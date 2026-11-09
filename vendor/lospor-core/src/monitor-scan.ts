/**
 * What a photographed patient monitor gives back (10.2.0). The API asks a vision model for the
 * numbers and this decides which of them are believable, so web, phone and API read the same
 * photo the same way.
 */

/** BIS is a whole number, 0 to 100. */
export function bisFromScan(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  const whole = Math.round(value)
  return whole >= 0 && whole <= 100 ? whole : null
}

/**
 * TOF is stored as the T4/T1 ratio, 0 to 1. Monitors show it as a percent (90), a decimal (0.9), or
 * as a train-of-four count (0 to 4), and a model reads whichever is on screen. A percent becomes a
 * ratio. A whole number from 1 to 4 is read as a count and discarded, because 3 cannot be told from
 * 3%, and a count of 1 (deep block) must never be stored as a ratio of 1 (full recovery). A
 * recovered patient still reads correctly: monitors show that as 100% or 0.9 and above. A ratio
 * above 1 is capped at 1.
 */
export function tofRatioFromScan(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null
  if (Number.isInteger(value) && value >= 1 && value <= 4) return null
  const ratio = value <= 1.5 ? value : value >= 5 && value <= 150 ? value / 100 : null
  if (ratio == null) return null
  return Math.round(Math.min(ratio, 1) * 100) / 100
}
