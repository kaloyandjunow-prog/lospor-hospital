/**
 * What dropping the end grip of an agent, infusion or fluid bar means.
 *
 * One rule for all three lanes, so a gesture writes the same event whatever
 * the bar is. Dropping a grip never writes a stop by itself:
 *
 * - a running bar dropped before now asks first, then writes one stop;
 * - a running bar dropped at or after now writes nothing and keeps running;
 * - a stopped bar dropped before or at now moves its existing stop;
 * - a stopped bar dropped after now takes the stop away (running again).
 */

export type EndDropOutcome =
  | { kind: "none" }
  | { kind: "confirm-stop"; col: number }
  | { kind: "move-stop"; col: number }
  | { kind: "resume" }

export function resolveEndDrop(input: {
  stopped: boolean
  startCol: number
  endCol: number
  dropCol: number
  nowCol: number | null
}): EndDropOutcome {
  const col = Math.max(input.dropCol, input.startCol)
  const pastNow = input.nowCol !== null && col > input.nowCol
  if (!input.stopped) {
    if (input.nowCol !== null && col >= input.nowCol) return { kind: "none" }
    return { kind: "confirm-stop", col }
  }
  if (pastNow) return { kind: "resume" }
  return col === input.endCol ? { kind: "none" } : { kind: "move-stop", col }
}
