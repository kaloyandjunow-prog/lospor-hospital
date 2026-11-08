/**
 * Which dantrolene vials to open for a dose (10.2.0), from the sizes the
 * hospital stocks (Status). The most economic mixture is the one with the
 * fewest vials (each 20 mg vial is 60 mL of water to reconstitute, so fewer is
 * faster at the bedside) that still leaves less than the smallest stocked
 * vial over: no vial is opened for drug that is not needed. Among those, the
 * least left over.
 *
 * 280 mg from 250 + 20: one 250 and two 20s (290 mg, 10 mg left over), not
 * two 250s, and not fourteen 20s.
 */
export type VialPlan = {
  /** Largest first: [{ size: 250, count: 1 }, { size: 20, count: 2 }]. */
  vials: { size: number; count: number }[]
  /** How many vials in all. */
  count: number
  /** The drug in the opened vials, and what the dose leaves over. */
  totalMg: number
  wasteMg: number
}

/** Above this many mg of dose the exhaustive search is skipped. */
const SEARCH_LIMIT_MG = 100_000

const EMPTY: VialPlan = { vials: [], count: 0, totalMg: 0, wasteMg: 0 }

export function dantroleneVialPlan(doseMg: number, stocked: readonly number[]): VialPlan {
  const sizes = [...new Set(stocked.filter(size => Number.isFinite(size) && size > 0))].sort((a, b) => b - a)
  if (!(doseMg > 0) || !Number.isFinite(doseMg) || sizes.length === 0) return EMPTY
  const target = Math.ceil(doseMg - 1e-9)
  const smallest = sizes[sizes.length - 1]!
  const larger = sizes.slice(0, -1)

  // The search below tries every count of each larger size. For any dose a person can be given that is a few thousand
  // tries; for an absurd one (a weight typed with extra zeros) it would run for minutes and freeze the screen. Past
  // this the answer is the plain one: the largest vials, then the smallest for the rest.
  if (target > SEARCH_LIMIT_MG) {
    const largest = sizes[0]!
    const whole = Math.floor(target / largest)
    const rest = Math.ceil((target - whole * largest) / smallest)
    const vials = largest === smallest
      ? [{ size: largest, count: whole + rest }]
      : [{ size: largest, count: whole }, { size: smallest, count: rest }].filter(item => item.count > 0)
    const totalMg = vials.reduce((sum, item) => sum + item.size * item.count, 0)
    return { vials, count: vials.reduce((sum, item) => sum + item.count, 0), totalMg, wasteMg: totalMg - doseMg }
  }

  let best: { counts: number[]; small: number; waste: number; count: number } | null = null
  const consider = (counts: number[]) => {
    const covered = counts.reduce((sum, count, index) => sum + count * larger[index]!, 0)
    const small = Math.max(0, Math.ceil((target - covered) / smallest))
    const waste = covered + small * smallest - target
    const count = counts.reduce((sum, c) => sum + c, 0) + small
    // A mixture that leaves a whole smallest vial over opened one it did not need.
    if (waste >= smallest) return
    const better = !best || count < best.count || (count === best.count && waste < best.waste)
    if (better) best = { counts: [...counts], small, waste, count }
  }
  // Every count of each larger size up to the one that alone covers the dose;
  // the rest is filled with the smallest, which is always the cheapest filler.
  const walk = (index: number, counts: number[]) => {
    if (index === larger.length) { consider(counts); return }
    const most = Math.ceil(target / larger[index]!)
    for (let count = 0; count <= most; count++) walk(index + 1, [...counts, count])
  }
  walk(0, [])

  const found = best as { counts: number[]; small: number; waste: number; count: number } | null
  if (!found) return EMPTY
  const vials = [...larger.map((size, index) => ({ size, count: found.counts[index]! })), { size: smallest, count: found.small }].filter(item => item.count > 0)
  return { vials, count: found.count, totalMg: target + found.waste, wasteMg: found.waste + (target - doseMg) }
}

/** "1 × 250 mg + 2 × 20 mg", or "" for an empty plan. */
export function vialPlanText(plan: VialPlan): string {
  return plan.vials.map(item => `${item.count} × ${item.size} mg`).join(" + ")
}
