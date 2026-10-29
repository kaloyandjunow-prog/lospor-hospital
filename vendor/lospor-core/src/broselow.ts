import type { ClinicalMode } from "./pediatric"

/**
 * The Broselow tape's colour zones, so a child's colour can be read off the
 * record the way it is read off the tape at the bedside.
 *
 * The tape is a length tape: a child is placed by height, and weight is only
 * what the zone then implies. This follows it, so height decides and weight is
 * used only when no height is recorded. The bands are the published ones
 * (Wikipedia's table of the current tape's NHANES-based zones, heights in cm
 * and weights in kg); the hospital's physical tape is the authority and a
 * different edition may differ by a few millimetres at a boundary.
 *
 * A zone is shown as guidance only: the tape estimates ideal body weight and is
 * less accurate in heavier children. Nothing is dosed from it here.
 */

export type BroselowColor = "GREY" | "PINK" | "RED" | "PURPLE" | "YELLOW" | "WHITE" | "BLUE" | "ORANGE" | "GREEN"

export type BroselowZone = {
  key: BroselowColor
  /** The colour of the tape zone itself. It is the thing being identified, so it never follows the app theme. */
  hex: string
  /** A readable text colour on `hex`. */
  textHex: string
  labelEn: string
  labelBg: string
  /** Length band, cm: from `minCm` up to but not including `maxCm`. */
  minCm: number
  maxCm: number
  /** Weight band, kg: from `minKg` up to but not including `maxKg`. */
  minKg: number
  maxKg: number
}

export const BROSELOW_ZONES: readonly BroselowZone[] = Object.freeze([
  { key: "GREY", hex: "#9ca3af", textHex: "#111827", labelEn: "Grey", labelBg: "Сив", minCm: 46.8, maxCm: 59.2, minKg: 3, maxKg: 6 },
  { key: "PINK", hex: "#f9a8d4", textHex: "#111827", labelEn: "Pink", labelBg: "Розов", minCm: 59.2, maxCm: 66.9, minKg: 6, maxKg: 8 },
  { key: "RED", hex: "#ef4444", textHex: "#ffffff", labelEn: "Red", labelBg: "Червен", minCm: 66.9, maxCm: 74.2, minKg: 8, maxKg: 10 },
  { key: "PURPLE", hex: "#8b5cf6", textHex: "#ffffff", labelEn: "Purple", labelBg: "Лилав", minCm: 74.2, maxCm: 83.8, minKg: 10, maxKg: 12 },
  { key: "YELLOW", hex: "#facc15", textHex: "#111827", labelEn: "Yellow", labelBg: "Жълт", minCm: 83.8, maxCm: 95.4, minKg: 12, maxKg: 15 },
  { key: "WHITE", hex: "#ffffff", textHex: "#111827", labelEn: "White", labelBg: "Бял", minCm: 95.4, maxCm: 108.3, minKg: 15, maxKg: 19 },
  { key: "BLUE", hex: "#3b82f6", textHex: "#ffffff", labelEn: "Blue", labelBg: "Син", minCm: 108.3, maxCm: 121.5, minKg: 19, maxKg: 24 },
  { key: "ORANGE", hex: "#f97316", textHex: "#111827", labelEn: "Orange", labelBg: "Оранжев", minCm: 121.5, maxCm: 130.7, minKg: 24, maxKg: 30 },
  { key: "GREEN", hex: "#22c55e", textHex: "#111827", labelEn: "Green", labelBg: "Зелен", minCm: 130.7, maxCm: 143.3, minKg: 30, maxKg: 37 },
])

export type BroselowResult = {
  zone: BroselowZone
  /** What placed the child: the tape reads length, weight is the fallback. */
  basis: "HEIGHT" | "WEIGHT"
}

function positive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

/**
 * The zone for a child, or null when the tape does not apply: an adult, a
 * child below the tape's shortest length (a preterm infant) or above its
 * longest, or nothing measured.
 */
export function broselowZone(input: {
  clinicalMode: ClinicalMode
  heightCm?: number | null
  weightKg?: number | null
}): BroselowResult | null {
  if (input.clinicalMode !== "PEDIATRIC") return null
  if (positive(input.heightCm)) {
    const zone = BROSELOW_ZONES.find(item => input.heightCm! >= item.minCm && input.heightCm! < item.maxCm)
    return zone ? { zone, basis: "HEIGHT" } : null
  }
  if (positive(input.weightKg)) {
    const zone = BROSELOW_ZONES.find(item => input.weightKg! >= item.minKg && input.weightKg! < item.maxKg)
    return zone ? { zone, basis: "WEIGHT" } : null
  }
  return null
}

export function broselowLabel(zone: BroselowZone, language: "en" | "bg" | string): string {
  return language === "bg" ? zone.labelBg : zone.labelEn
}
