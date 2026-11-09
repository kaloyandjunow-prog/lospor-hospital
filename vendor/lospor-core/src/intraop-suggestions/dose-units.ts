/**
 * A suggestion's dose moved into the unit its sheet speaks (10.2.0): 50 mcg
 * in a sheet in mg is 0.05 mg. Only masses convert; a dose the sheet's unit
 * cannot express gives null, and the sheet keeps its own dose rather than
 * show the number beside the wrong unit.
 */
const MASS_IN_MG: Record<string, number> = { g: 1000, mg: 1, mcg: 0.001, "µg": 0.001, ng: 0.000001 }

export function convertDoseAmount(amount: number, from: string, to: string): number | null {
  if (from === to) return amount
  const a = MASS_IN_MG[from.toLowerCase()]
  const b = MASS_IN_MG[to.toLowerCase()]
  if (a == null || b == null) return null
  // Twelve significant digits clear float noise (0.1 + 0.2) without costing a small amount its value: a fixed number
  // of decimals turned 64.31 mcg into 64 mcg on the way to grams and back.
  return Number((amount * a / b).toPrecision(12))
}
