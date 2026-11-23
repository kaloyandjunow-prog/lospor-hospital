import { shadeForSameGroup } from "./drug-colors-iso"
import { normalizeDrugColor } from "./drug-colors"

type LaneSegment = { id: string; name: string; startCol: number; endCol: number; stopped?: boolean; color?: string }
type LaneConfig = { color: string; group?: string }

/**
 * The colour of an infusion's row. A second infusion of the same group running beside one (two syringes of
 * propofol, propofol with another hypnotic) is told apart by a lighter or darker shade of the group's colour, so
 * its row can be followed by colour as well as by name (PRAVILA 13). A restart of the same infusion keeps its colour.
 */
export function infusionLaneColor(all: readonly LaneSegment[], lane: LaneSegment, configs: Readonly<Record<string, LaneConfig | undefined>>): string {
  const base = configs[lane.name]?.color ?? lane.color ?? "#64748b"
  const groupOf = (name: string) => configs[name]?.group ?? name
  const runs = new Map<string, { start: number; end: number; stopped: boolean; group: string }>()
  for (const item of all) {
    const run = runs.get(item.id)
    runs.set(item.id, {
      start: Math.min(run?.start ?? item.startCol, item.startCol),
      end: Math.max(run?.end ?? item.endCol, item.endCol),
      stopped: Boolean(item.stopped) && item.endCol >= (run?.end ?? item.endCol),
      group: groupOf(item.name),
    })
  }
  const mine = runs.get(lane.id)
  if (!mine) return base
  let index = 0
  for (const [id, other] of runs) {
    if (id === lane.id || other.group !== mine.group) continue
    const earlier = other.start < mine.start || (other.start === mine.start && id < lane.id)
    const stillHolds = !other.stopped || other.end >= mine.start
    if (earlier && stillHolds) index += 1
  }
  // Only a #rrggbb colour can be shaded; any other value (a named or rgb() colour) is used as it is.
  const hex = normalizeDrugColor(base)
  return hex ? shadeForSameGroup(hex, index) : base
}
