export function parseClinicalNumber(text: string): number | undefined {
  const normalised = text.trim().replace(",", ".")
  if (!normalised) return undefined
  const parsed = Number(normalised)
  return Number.isFinite(parsed) ? parsed : undefined
}
