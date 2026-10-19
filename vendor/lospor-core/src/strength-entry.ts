import { canonicalConcentrationUnit } from "./clinical-rule-vocabulary"

/**
 * A strength typed with Other (2026-10-18): a local anaesthetic's or a fluid's
 * %, or a drug's mg/mL, entered like a dose -- slider, one-tap values, a
 * prefill and the number itself -- instead of free text. Both apps draw it
 * from here, so the range and the refusal are the same everywhere.
 */
export type StrengthField = {
  /** The display unit: "%", "mg/mL", "mcg/mL", ... */
  unit: string
  min: number
  max: number
  step: number
  quickValues: number[]
  prefill: number
}

type Range = { min: number; max: number; step: number }

// Clinical ranges for the strengths in common use, by name. Wider than the
// pills, so an unusual but real strength (ropivacaine 0.15%, lidocaine 4%
// topical, NaCl 23.4%) can be entered; narrower than anything nonsensical.
const PERCENT_RANGES: [match: RegExp, range: Range][] = [
  [/ropivacaine/i, { min: 0.05, max: 1, step: 0.025 }],
  [/bupivacaine/i, { min: 0.05, max: 0.75, step: 0.0125 }],
  [/lidocaine|lignocaine/i, { min: 0.25, max: 5, step: 0.25 }],
  [/mepivacaine/i, { min: 0.5, max: 3, step: 0.25 }],
  [/prilocaine/i, { min: 0.5, max: 4, step: 0.25 }],
  [/chloroprocaine/i, { min: 0.5, max: 3, step: 0.25 }],
  [/tetracaine|amethocaine/i, { min: 0.25, max: 4, step: 0.25 }],
  [/articaine/i, { min: 1, max: 4, step: 0.5 }],
  [/glucose|dextrose/i, { min: 1, max: 50, step: 0.5 }],
  [/bicarbonate/i, { min: 1, max: 8.4, step: 0.1 }],
  [/sodium chloride|saline|nacl/i, { min: 0.45, max: 23.4, step: 0.05 }],
  [/mannitol/i, { min: 5, max: 25, step: 5 }],
  [/albumin/i, { min: 4, max: 25, step: 0.5 }],
]

// With nothing known of the drug: the unit's plausible span.
const UNIT_RANGES: Record<string, Range & { quickValues: number[] }> = {
  "%": { min: 0.05, max: 20, step: 0.05, quickValues: [0.5, 1, 2, 5] },
  "mg/mL": { min: 0.1, max: 100, step: 0.1, quickValues: [1, 2, 5, 10] },
  "mcg/mL": { min: 1, max: 1000, step: 1, quickValues: [10, 50, 100, 500] },
}
const FALLBACK_RANGE = { min: 0.1, max: 1000, step: 0.1, quickValues: [1, 10, 100] }

const decimalsOf = (value: number) => {
  const text = String(value)
  const dot = text.indexOf(".")
  return dot < 0 ? 0 : text.length - dot - 1
}
const snap = (value: number, step: number) => Number((Math.round(value / step) * step).toFixed(Math.max(decimalsOf(step), 0)))

/** The number in a strength label ("0.2%", "2 mg/mL"); null when there is none. */
export function strengthValue(label: string | null | undefined): number | null {
  const match = /^\s*(\d+(?:[.,]\d+)?)/.exec(label ?? "")
  if (!match) return null
  const value = Number(match[1]!.replace(",", "."))
  return Number.isFinite(value) && value > 0 ? value : null
}

/** "0.15" in % → "0.15%"; in mg/mL → "0.15 mg/mL", the pills' own form. */
export function formatStrength(value: number, unit: string): string {
  return unit === "%" ? `${value}%` : `${value} ${unit}`
}

/**
 * The fields for a strength typed with Other: a named drug's clinical range,
 * else one drawn from its own strengths (half the lowest to twice the
 * highest, on a step every pill lands on), else the unit's span. The pills
 * are the drug's strengths; the prefill is the middle one. Null for a unit
 * this cannot place.
 */
export function customStrengthField(input: { name?: string; unit?: string; options?: string[] }): StrengthField | null {
  // No unit named: the one the pills are written in ("0.5%", "2 mg/mL").
  const written = input.unit ?? input.options?.map(option => option.replace(/^\s*\d+(?:[.,]\d+)?\s*/, "")).find(Boolean)
  const unit = written ? canonicalConcentrationUnit(written)?.display : undefined
  if (!unit) return null
  const values = [...new Set((input.options ?? []).map(strengthValue).filter((value): value is number => value != null))].sort((a, b) => a - b)
  const known = unit === "%" && input.name ? PERCENT_RANGES.find(([match]) => match.test(input.name!))?.[1] : undefined
  let range: Range
  if (known) range = known
  else if (values.length) {
    const lowest = values[0]!
    const highest = values[values.length - 1]!
    const step = Math.min(10 ** (Math.floor(Math.log10(lowest)) - 1), ...values.map(value => 10 ** -decimalsOf(value)))
    range = { min: Math.max(step, snap(lowest / 2, step)), max: snap(highest * 2, step), step }
  } else range = UNIT_RANGES[unit] ?? FALLBACK_RANGE
  const quickValues = values.filter(value => value >= range.min && value <= range.max)
  const pills = quickValues.length ? quickValues : (UNIT_RANGES[unit] ?? FALLBACK_RANGE).quickValues.filter(value => value >= range.min && value <= range.max)
  const middle = pills.length ? pills[Math.floor((pills.length - 1) / 2)]! : range.min
  return { unit, ...range, quickValues: pills, prefill: middle }
}

/**
 * The strength entered, or why it cannot be used: "empty" for no number,
 * "range" for one outside the field's span (the screen names the span).
 */
export function customStrength(field: StrengthField, text: string | number | null | undefined):
  | { value: number; label: string }
  | { error: "empty" | "range" } {
  const raw = typeof text === "number" ? String(text) : (text ?? "").trim().replace(",", ".")
  if (!raw) return { error: "empty" }
  const value = Number(raw)
  if (!Number.isFinite(value)) return { error: "empty" }
  if (value < field.min || value > field.max) return { error: "range" }
  return { value, label: formatStrength(value, field.unit) }
}

/**
 * The strength label for a number typed with Other, in the unit the drug's
 * strengths are written in ("0.15" in PERCENT → "0.15%"; in MG_PER_ML →
 * "2 mg/mL"). Undefined while there is no number.
 */
export function customStrengthLabel(text: string | null | undefined, unit: string | null | undefined): string | undefined {
  const value = Number((text ?? "").trim().replace(",", "."))
  if (!(text ?? "").trim() || !Number.isFinite(value)) return undefined
  const display = unit ? canonicalConcentrationUnit(unit)?.display : undefined
  return display ? formatStrength(value, display) : String(value)
}
