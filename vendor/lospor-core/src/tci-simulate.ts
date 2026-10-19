import type { TciParams, TciSite } from "./tci-models"

/**
 * What a TCI pump delivers for a sequence of targets, and the plasma and
 * effect-site concentrations it predicts (2026-10-18). The same calculation
 * on the phone, the web and the server, so a total is the same everywhere.
 *
 * The model is solved exactly over each step (matrix exponential), as the
 * pumps do, every 10 seconds:
 *   - plasma targeting (Jacobs 1990): the rate that brings Cp to the target
 *     at the end of the step;
 *   - effect-site targeting (Shafer & Gregg 1992): the largest pulse whose
 *     effect-site peak just reaches the target, then plasma-style
 *     maintenance once Cp and Ce have settled near it;
 * both limited to what the pump can push (0 to its maximum rate).
 *
 * A calculation, not a measurement: pumps differ in step and rounding, so
 * the pump's own total, when entered, is the one that counts.
 */

export type TciSegment = {
  /** Minutes from the start of the infusion. */
  startMin: number
  endMin: number
  /** In the model's target unit (µg/mL propofol, ng/mL opioids). 0 stops delivery. */
  target: number
}

export type TciStep = {
  /** Minutes from the start, at the beginning of the step. */
  t: number
  /** Delivery during the step, amount per minute. */
  rate: number
  /** Concentrations at the beginning of the step. */
  cp: number
  ce: number
}

export type TciSimulation = {
  /** Amount delivered in the model's amount unit (mg propofol, µg opioids). */
  amount: number
  steps: TciStep[]
  /** Concentrations at the end. */
  end: { t: number; cp: number; ce: number }
}

export const TCI_STEP_MIN = 1 / 6
/** Infusion pumps run at most 1200 mL/h. */
export const TCI_PUMP_MAX_ML_PER_MIN = 20

type Matrix = number[][]

function multiply(a: Matrix, b: Matrix): Matrix {
  const n = a.length, m = b[0].length, k = b.length
  const out: Matrix = Array.from({ length: n }, () => new Array<number>(m).fill(0))
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    let sum = 0
    for (let x = 0; x < k; x++) sum += a[i][x] * b[x][j]
    out[i][j] = sum
  }
  return out
}

/** e^M by scaling and squaring a Taylor series; the matrices here are 5×5. */
function expm(m: Matrix): Matrix {
  const n = m.length
  const norm = Math.max(...m.map(row => row.reduce((sum, value) => sum + Math.abs(value), 0)))
  const squarings = Math.max(0, Math.ceil(Math.log2(norm || 1)) + 1)
  const scale = 2 ** squarings
  const scaled = m.map(row => row.map(value => value / scale))
  let result: Matrix = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
  let term = result.map(row => row.slice())
  for (let order = 1; order <= 20; order++) {
    term = multiply(term, scaled).map(row => row.map(value => value / order))
    result = result.map((row, i) => row.map((value, j) => value + term[i][j]))
  }
  for (let i = 0; i < squarings; i++) result = multiply(result, result)
  return result
}

/** One step of length dt: state' = Φ·state + Γ·rate, state = [A1, A2, A3, Ce]. */
type Stepper = { phi: Matrix; gamma: number[] }

function stepper(p: TciParams, dt: number): Stepper {
  // Amounts in the three compartments and the effect-site concentration.
  const a: Matrix = [
    [-(p.k10 + p.k12 + p.k13), p.k21, p.k31, 0, 1],
    [p.k12, -p.k21, 0, 0, 0],
    [p.k13, 0, -p.k31, 0, 0],
    [p.ke0 / p.v1, 0, 0, -p.ke0, 0],
    [0, 0, 0, 0, 0],
  ].map(row => row.map(value => value * dt))
  const e = expm(a)
  return { phi: e.slice(0, 4).map(row => row.slice(0, 4)), gamma: e.slice(0, 4).map(row => row[4]) }
}

function advance(s: Stepper, x: number[], rate: number): number[] {
  return s.phi.map((row, i) => row.reduce((sum, value, j) => sum + value * x[j], 0) + s.gamma[i] * rate)
}

/** The plasma rate (Jacobs): Cp at the end of the step equal to the target. */
function plasmaRate(s: Stepper, p: TciParams, x: number[], target: number, maxRate: number): number {
  const free = advance(s, x, 0)[0] / p.v1
  const unit = s.gamma[0] / p.v1
  return Math.min(maxRate, Math.max(0, (target - free) / unit))
}

/**
 * The effect-site rate (Shafer & Gregg): the largest pulse this step for
 * which the effect site, left alone afterwards, peaks no higher than the
 * target -- min over t of (target - Ce_free(t)) / Ce_unit(t).
 */
function effectRate(s: Stepper, p: TciParams, x: number[], target: number, maxRate: number, unitCe: number[]): number {
  const cp = x[0] / p.v1
  const ce = x[3]
  if (ce >= target) return 0
  if (Math.abs(target - cp) / target <= 0.2 && Math.abs(target - ce) / target <= 0.05) {
    return plasmaRate(s, p, x, target, maxRate)
  }
  let state = x
  let best = Infinity
  for (const unit of unitCe) {
    state = advance(s, state, 0)
    if (unit > 1e-12) best = Math.min(best, (target - state[3]) / unit)
  }
  return Math.min(maxRate, Math.max(0, Number.isFinite(best) ? best : 0))
}

/** Ce after each step from empty, for a unit-rate pulse in the first step, until well past its peak. */
function unitEffectResponse(s: Stepper): number[] {
  const out: number[] = []
  let state = advance(s, [0, 0, 0, 0], 1)
  out.push(state[3])
  let falling = 0
  for (let i = 1; i < 1440 && falling < 30; i++) {
    state = advance(s, state, 0)
    falling = state[3] < out[out.length - 1] ? falling + 1 : 0
    out.push(state[3])
  }
  return out
}

/**
 * Runs the pump over the segments in order from an empty patient. Segments
 * must be contiguous from 0; a gap is delivered at target 0.
 */
export function simulateTci(input: {
  params: TciParams
  site: TciSite
  segments: TciSegment[]
  /** Amount per minute the pump can push (strength × 20 mL/min). */
  maxRate: number
  stepMin?: number
}): TciSimulation {
  const { params: p, site, maxRate } = input
  const dt = input.stepMin ?? TCI_STEP_MIN
  const full = stepper(p, dt)
  const unitCe = site === "EFFECT" ? unitEffectResponse(full) : []
  const steppers = new Map<number, Stepper>([[dt, full]])
  const stepperFor = (length: number) => {
    const key = Math.round(length * 1e9) / 1e9
    let s = steppers.get(key)
    if (!s) { s = stepper(p, key); steppers.set(key, s) }
    return s
  }
  const segments = input.segments.filter(segment => segment.endMin > segment.startMin).sort((a, b) => a.startMin - b.startMin)
  const end = segments.length ? segments[segments.length - 1].endMin : 0
  let x = [0, 0, 0, 0]
  let t = 0
  let amount = 0
  const steps: TciStep[] = []
  let index = 0
  while (t < end - 1e-9) {
    while (index < segments.length - 1 && t >= segments[index].endMin - 1e-9) index++
    const segment = segments[index]
    const target = t >= segment.startMin - 1e-9 ? segment.target : 0
    const length = Math.min(dt, segment.endMin - t)
    const s = length === dt ? full : stepperFor(length)
    const rate = target <= 0 ? 0
      : site === "EFFECT" && length === dt ? effectRate(s, p, x, target, maxRate, unitCe)
        : plasmaRate(s, p, x, target, maxRate)
    steps.push({ t, rate, cp: x[0] / p.v1, ce: x[3] })
    x = advance(s, x, rate)
    amount += rate * length
    t += length
  }
  return { amount, steps, end: { t, cp: x[0] / p.v1, ce: x[3] } }
}
