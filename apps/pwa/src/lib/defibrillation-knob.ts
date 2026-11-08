import { DEFIBRILLATION_KNOB_SWEEP, defibrillationEnergyAtAngle, defibrillationKnobAngle } from "@lospor/core/defibrillation"

/**
 * The energy knob (10.1.0), drawn from Core's dial mapping -- the same the
 * web dialog uses: 1 J at the left end of the sweep, 360 J at the right, the
 * gap at the bottom. This adds only the touch point and the drawing.
 */
export const KNOB_SWEEP = DEFIBRILLATION_KNOB_SWEEP
const HALF = KNOB_SWEEP / 2

export const knobAngleForEnergy = defibrillationKnobAngle

/** The energy at a touch point inside a knob of `size`; a touch in the gap goes to the nearer end. */
export function knobEnergyForPoint(x: number, y: number, size: number): number {
  return defibrillationEnergyAtAngle(Math.atan2(x - size / 2, size / 2 - y) * 180 / Math.PI)
}

/** A point on the knob's circle at an angle, for drawing. */
export function knobPoint(angle: number, radius: number, center: number): { x: number; y: number } {
  const rad = angle * Math.PI / 180
  return { x: center + radius * Math.sin(rad), y: center - radius * Math.cos(rad) }
}

/** The SVG path of the arc from the start of the sweep to an angle. */
export function knobArcPath(toAngle: number, radius: number, center: number): string {
  const start = knobPoint(-HALF, radius, center)
  const end = knobPoint(toAngle, radius, center)
  const large = toAngle + HALF > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`
}

type Listener = () => void
let openAt: string | null = null
const listeners = new Set<Listener>()

/** The Defibrillation sheet is opened from the slot sheet with the slot's time; one at a time. */
export const defibrillationSheet = {
  open(ts: string) { openAt = ts; listeners.forEach(listener => listener()) },
  close() { openAt = null; listeners.forEach(listener => listener()) },
  current: () => openAt,
  subscribe(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
}
