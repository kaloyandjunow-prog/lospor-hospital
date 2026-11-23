import type { IntraopMenuAction } from "@lospor/core/intraop-menu"
import type { IntraopEditRefusal } from "@lospor/core/intraop-edits"
import type { IntraopItemKind } from "@lospor/core/intraop-commands"
import type { ClockTime } from "@lospor/core/time-entry"
import type { LogEvent } from "@lospor/core/intraop-types"

// The chart menu's shapes (10.8.0), shared by the host, the lanes and the cursor.

export type ContinuousTarget = { kind: IntraopItemKind; key: string; col: number; rect: DOMRect; title: string }
export type PointTarget = { eventId: string; rect: DOMRect; title: string }

export type LaneDialogs = {
  changeDose: (target: ContinuousTarget, planned: boolean) => void
  changeSyringe: (target: ContinuousTarget) => void
  switchAgent: (target: ContinuousTarget) => void
  /** Infusion and fluid stops ask for a volume or the pump's total. */
  stopWithData: (target: ContinuousTarget, finish: (extra?: Record<string, unknown>) => void) => boolean
  /** True when the lane opened its own editor (a drug's dose); otherwise Edit sets the time, as on the PWA. */
  editPoint: (event: LogEvent, rect: DOMRect) => boolean | void
  /** True when a dose sheet took it; otherwise the entry is repeated at now as it was (the event log). */
  repeatDose: (event: LogEvent, rect: DOMRect) => boolean | void
}

/** What the lanes need to draw totals and the current dose (10.8.0). */
export type ChartFacts = { ibw: number | null; tbw: number | null; tciPatient: unknown; nowCol: number | null; chartChangedAt?: number }

/**
 * The menu's own many-step history (10.8.0), Core's, as on the PWA. Undo and Redo
 * (toolbar, Ctrl+Z / Ctrl+Y) take the newer of this and the chart's own history.
 */
export type MenuHistory = { canUndo: boolean; canRedo: boolean; lastAt: number; undo: () => boolean; redo: () => boolean }

export type MenuApi = {
  history: MenuHistory
  /** True when the cell had something to do (the menu opened). */
  openContinuous: (target: ContinuousTarget) => boolean
  openPoint: (target: PointTarget) => boolean
  /** The keyboard's Delete: what is in that cell, or that entry, with Undo. */
  deleteAt: (target: { kind: string; key: string; col: number } | { eventId: string }) => void
  /** Dropping a bar's end grip (rule 6): the menu's stop / planned stop / fix-end, with Undo, no question. */
  endDrop: (target: ContinuousTarget, stopped: boolean) => void
  facts: ChartFacts
}

export type Open =
  | { kind: "continuous"; target: ContinuousTarget; actions: IntraopMenuAction[] }
  | { kind: "point"; target: PointTarget; event: LogEvent; actions: IntraopMenuAction[] }

export type Wheel = { title: string; value: ClockTime; reference: Date; apply: (instant: Date) => IntraopEditRefusal | null }

