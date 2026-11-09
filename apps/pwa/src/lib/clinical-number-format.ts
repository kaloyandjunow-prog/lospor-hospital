export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function formatValue(value: number | null | undefined, precision: number) {
  if (value == null) return ""
  return precision > 0 ? value.toFixed(precision).replace(/\.0+$/, "") : String(Math.round(value))
}
