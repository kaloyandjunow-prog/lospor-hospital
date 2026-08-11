"use client"

import type { TtSel } from "./timetable-types"

/**
 * What an infusion drag looks like before the mouse is released.
 *
 * Three drags can be in progress on an infusion — the whole bar moving to a
 * different time, and either end being pulled to lengthen or shorten it — and
 * each draws a faded outline of where the bar would land. Without it the chart
 * only changes on drop, which means committing to a time before seeing it.
 *
 * Rendered per column, so the rounded corner appears on whichever cell is the
 * end of the previewed span.
 */

const ghostBase = { top: 22, bottom: 4 } as const

export function MoveGhost({ color, isFirst, isLast }: { color: string; isFirst: boolean; isLast: boolean }) {
  return (
    <div
      className="absolute left-0 right-0 border border-dashed opacity-25"
      style={{
        ...ghostBase,
        backgroundColor: color + "33",
        borderColor: color,
        borderRadius: isFirst ? "6px 0 0 6px" : isLast ? "0 6px 6px 0" : 0,
      }}
    />
  )
}

/** The handle drawn at the hovered end while a grip is being dragged. */
function GhostGrip({ color, side }: { color: string; side: "left" | "right" }) {
  return (
    <div
      className={`absolute ${side}-0 z-20 flex items-center justify-center ${side === "left" ? "rounded-l-sm" : "rounded-r-sm"}`}
      style={{ ...ghostBase, width: 10, backgroundColor: color, opacity: 0.7 }}
    >
      <span className="text-white text-[8px] font-bold select-none">|</span>
    </div>
  )
}

export function ExtendGhost({
  color,
  side,
  atHoverEdge,
  showGrip,
}: {
  color: string
  side: "left" | "right"
  /** This column is the end the grip is currently over. */
  atHoverEdge: boolean
  showGrip: boolean
}) {
  const edge = side === "right" ? "borderRight" : "borderLeft"
  return (
    <>
      <div
        className="absolute left-0 right-0 opacity-40 border-y"
        style={{
          ...ghostBase,
          backgroundColor: color + "33",
          borderColor: color + "88",
          [edge]: atHoverEdge ? `1px solid ${color}88` : undefined,
          borderRadius: atHoverEdge ? (side === "right" ? "0 6px 6px 0" : "6px 0 0 6px") : 0,
        }}
      />
      {atHoverEdge && showGrip && <GhostGrip color={color} side={side} />}
    </>
  )
}

/** True when the ghost's grip should show: the previewed bar is the selected one. */
export function ghostGripVisible(sel: TtSel | null, segId: string): boolean {
  return sel?.type === "infusion" && sel.id === segId
}
