/**
 * Where a slider lands. Some controls step finely with - and + (0.1) but are
 * easier to set on a coarser slider (0.5): with no `sliderStep`, or one no
 * coarser than `step`, the raw position is returned for the caller to round.
 */
export function sliderLanding(raw: number, step: number, sliderStep?: number): number {
  if (!sliderStep || sliderStep <= step) return raw
  return Math.round(raw / sliderStep) * sliderStep
}
