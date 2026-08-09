/**
 * Practical rounding for calculated doses.
 *
 * A weight-based calculation produces numbers nobody can draw up: 2.5 mg/kg on a
 * 27 kg child is 67.5 mg of propofol, and rounding that to the slider's 1 mg step
 * gives 68 mg. The clinician then ignores the autofill, which defeats it.
 *
 * The increment cannot be a constant, because paediatric doses span roughly
 * 0.05 mg to 400 mg. Adult propofol rounds to 10 mg, which is right at 140 mg but
 * a +33% overdose on a neonate's 7.5 mg. So the increment scales with the dose.
 */

/** Dose magnitude -> the increment a clinician would actually draw. */
const PRACTICAL_INCREMENTS: readonly { below: number; increment: number }[] = [
  { below: 0.5, increment: 0.05 },
  { below: 2, increment: 0.1 },
  { below: 10, increment: 0.5 },
  { below: 30, increment: 1 },
  { below: 100, increment: 5 },
]
const LARGE_DOSE_INCREMENT = 10

/**
 * The increment a dose of this size should snap to.
 * Magnitude-based, so it works for mcg and mg alike — what matters is the size of
 * the number the clinician reads and draws.
 */
export function practicalDoseIncrement(dose: number): number {
  if (!Number.isFinite(dose)) return 0
  const magnitude = Math.abs(dose)
  for (const band of PRACTICAL_INCREMENTS) {
    if (magnitude < band.below) return band.increment
  }
  return LARGE_DOSE_INCREMENT
}

/**
 * The increment to actually use, given whatever the rule declares.
 *
 * A declared increment is honoured only when it is *coarser* than the practical
 * one. Anything finer is a UI-granularity artifact — paediatric rules inherited
 * their `roundTo` from the slider `step` — and would reintroduce undosable
 * numbers. This lets a clinician deliberately coarsen a drug (draw it in 10s)
 * without letting a stale step value make the autofill useless again.
 */
export function effectiveDoseIncrement(
  dose: number,
  declared?: number | null,
): number {
  const practical = practicalDoseIncrement(dose)
  if (declared == null || !Number.isFinite(declared) || declared <= 0) return practical
  return Math.max(declared, practical)
}

/**
 * Round a dose to a drawable value.
 * `mode` matches DoseProfile.rounding so callers can floor/ceil where a drug
 * must never be rounded up.
 */
export function roundToPracticalDose(
  dose: number,
  declared?: number | null,
  mode: "nearest_step" | "floor_step" | "ceil_step" = "nearest_step",
): number {
  if (!Number.isFinite(dose)) return dose
  const increment = effectiveDoseIncrement(dose, declared)
  if (increment <= 0) return dose
  const scaled = dose / increment
  const snapped = mode === "floor_step"
    ? Math.floor(scaled)
    : mode === "ceil_step"
      ? Math.ceil(scaled)
      : Math.round(scaled)
  // toPrecision keeps 0.1-style increments from producing 7.500000000000001.
  return Number((snapped * increment).toPrecision(12))
}
