/**
 * The ranges of the gas controls (10.2.0), shared so the web and phone
 * sliders behave the same.
 *
 * Fresh gas flow: the slider spans 0-20 L/min, in 0.1 steps up to 5 L/min
 * (low-flow anaesthesia) and 0.5 steps above; a typed value may go to
 * 100 L/min (high-flow nasal oxygen).
 *
 * Jet ventilation: driving pressure on a 0-4 bar slider in 0.1 steps, typed
 * to 6 bar; rate from quick buttons for manual (15/min) and high-frequency
 * jet, typed to 600/min; FiO2 as in the gas sheet.
 */

export const FRESH_GAS_FLOW = Object.freeze({
  min: 0,
  sliderMax: 20,
  typedMax: 100,
  fineStepUpTo: 5,
  fineStep: 0.1,
  coarseStep: 0.5,
  unit: "L/min",
})

/** The slider step at a flow: 0.1 below 5 L/min, 0.5 from 5. */
export function freshGasFlowStep(flow: number): number {
  return flow < FRESH_GAS_FLOW.fineStepUpTo ? FRESH_GAS_FLOW.fineStep : FRESH_GAS_FLOW.coarseStep
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step
const clean = (value: number) => Math.round(value * 10) / 10

/** A slider position as a flow on the slider's steps, within 0-20. */
export function snapFreshGasFlow(flow: number): number {
  if (!Number.isFinite(flow)) return FRESH_GAS_FLOW.min
  const bounded = Math.min(FRESH_GAS_FLOW.sliderMax, Math.max(FRESH_GAS_FLOW.min, flow))
  return clean(roundTo(bounded, freshGasFlowStep(bounded)))
}

/** One step up or down from a flow, as the stepper buttons move it. */
export function stepFreshGasFlow(flow: number, direction: 1 | -1): number {
  const current = Number.isFinite(flow) ? flow : FRESH_GAS_FLOW.min
  // Stepping down from exactly 5 uses the fine step, so 5.0 goes to 4.9, not 4.5.
  const step = direction < 0 && current <= FRESH_GAS_FLOW.fineStepUpTo ? FRESH_GAS_FLOW.fineStep : freshGasFlowStep(current)
  const next = clean(current + direction * step)
  return Math.min(Math.max(next, FRESH_GAS_FLOW.min), Math.max(current, FRESH_GAS_FLOW.sliderMax))
}

/** A typed flow, or null when it is not a number in 0-100 L/min. */
export function parseTypedFreshGasFlow(value: string | number): number | null {
  const parsed = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."))
  if (!Number.isFinite(parsed) || parsed < FRESH_GAS_FLOW.min || parsed > FRESH_GAS_FLOW.typedMax) return null
  return clean(parsed)
}

export const JET_VENTILATION = Object.freeze({
  pressure: Object.freeze({ min: 0, sliderMax: 4, step: 0.1, typedMax: 6, unit: "bar" }),
  rate: Object.freeze({ quick: Object.freeze([15, 100, 150, 300]), min: 1, typedMax: 600, unit: "/min" }),
  fio2: Object.freeze({ min: 21, max: 100, unit: "%" }),
})

/** A typed driving pressure, or null when it is not a number in 0-6 bar. */
export function parseJetPressure(value: string | number): number | null {
  const parsed = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."))
  if (!Number.isFinite(parsed) || parsed < JET_VENTILATION.pressure.min || parsed > JET_VENTILATION.pressure.typedMax) return null
  return clean(parsed)
}

/** A typed jet rate, or null when it is not a whole number in 1-600 per minute. */
export function parseJetRate(value: string | number): number | null {
  const parsed = typeof value === "number" ? value : Number(String(value).trim())
  if (!Number.isInteger(parsed) || parsed < JET_VENTILATION.rate.min || parsed > JET_VENTILATION.rate.typedMax) return null
  return parsed
}
