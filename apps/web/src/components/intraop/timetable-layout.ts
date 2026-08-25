import { INTRAOP_COLUMN_MINUTES } from "@lospor/core/intraop-engine"
import type { FConflictAnchor } from "./timetable-types"

export const COL_W = 74
export const LABEL_W = 96
export const INTERVAL = INTRAOP_COLUMN_MINUTES
export const ROW_COLS = 60 / INTRAOP_COLUMN_MINUTES

/** Presents a stored picker rectangle as the measurable element openFP expects. */
export function rectAnchor(rect: FConflictAnchor & { height?: number }): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
      width: rect.width, height: rect.height ?? rect.bottom - rect.top,
      x: rect.left, y: rect.top, toJSON: () => ({}),
    }),
  } as unknown as HTMLElement
}
