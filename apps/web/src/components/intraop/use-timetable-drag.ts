"use client"

import { useMemo, useReducer } from "react"
import type { InfusionBarMove, RatePillMove } from "./TimetableInfusionLane"

/**
 * Everything the chart is in the middle of being dragged.
 *
 * This was sixteen independent `useState` pairs threaded through every lane,
 * which made two things hard to see. One is that only one drag can be happening
 * at a time — the chart has a single mouse — so the states are alternatives
 * rather than sixteen orthogonal facts. The other is that each drag is the same
 * shape: something is picked up, a column is hovered, and the drag either lands
 * or is abandoned.
 *
 * Naming those three moments is what this is for. A lane says
 * `drag.startInfusionExtend(id, "right")` rather than setting two unrelated
 * pieces of state and hoping the pair stays consistent.
 *
 * The state itself is deliberately a faithful copy of what was there before —
 * no drag is cleared implicitly by another starting. Making drags mutually
 * exclusive would be a behaviour change, and this is not the commit for it.
 */

export type DragSide = "left" | "right"

export type TimetableDragState = {
  /** An infusion bar picked up to move whole, and the column under the cursor. */
  movingInf: InfusionBarMove | null
  movingInfCol: number | null
  /** A rate change picked up to slide to another column. */
  movingRatePill: RatePillMove | null
  /** An infusion grip being pulled, per side, and the column under the cursor. */
  extendingInf: string | null
  extInfHover: number | null
  extendingInfLeft: string | null
  extInfLeftHover: number | null
  /** A fluid grip being pulled. */
  extendingFluid: string | null
  extFluidHover: number | null
  /** An agent grip being pulled, identified by the segment's start column. */
  extendingAgent: number | null
  extendHoverCol: number | null
  /** Column highlighted as a drop target while something is dragged over it. */
  dragOver: number | null
  fluidDragOver: number | null
}

const EMPTY: TimetableDragState = {
  movingInf: null,
  movingInfCol: null,
  movingRatePill: null,
  extendingInf: null,
  extInfHover: null,
  extendingInfLeft: null,
  extInfLeftHover: null,
  extendingFluid: null,
  extFluidHover: null,
  extendingAgent: null,
  extendHoverCol: null,
  dragOver: null,
  fluidDragOver: null,
}

type Action =
  | { type: "infusionMoveStart"; move: InfusionBarMove }
  | { type: "infusionMoveHover"; col: number }
  | { type: "infusionMoveEnd" }
  | { type: "ratePillStart"; move: RatePillMove }
  | { type: "ratePillEnd" }
  | { type: "infusionExtendStart"; id: string; side: DragSide }
  | { type: "infusionExtendHover"; col: number; side: DragSide }
  | { type: "infusionExtendEnd"; side: DragSide }
  | { type: "fluidExtendStart"; id: string }
  | { type: "fluidExtendHover"; col: number }
  | { type: "fluidExtendEnd" }
  | { type: "agentExtendStart"; startCol: number }
  | { type: "agentExtendHover"; col: number }
  | { type: "agentExtendEnd" }
  | { type: "dropTargetOver"; col: number | null }
  | { type: "fluidDropTargetOver"; col: number | null }

function reduce(state: TimetableDragState, action: Action): TimetableDragState {
  switch (action.type) {
    case "infusionMoveStart":
      return { ...state, movingInf: action.move }
    case "infusionMoveHover":
      return { ...state, movingInfCol: action.col }
    case "infusionMoveEnd":
      return { ...state, movingInf: null, movingInfCol: null }

    case "ratePillStart":
      return { ...state, movingRatePill: action.move }
    case "ratePillEnd":
      return { ...state, movingRatePill: null }

    case "infusionExtendStart":
      return action.side === "right"
        ? { ...state, extendingInf: action.id }
        : { ...state, extendingInfLeft: action.id }
    case "infusionExtendHover":
      return action.side === "right"
        ? { ...state, extInfHover: action.col }
        : { ...state, extInfLeftHover: action.col }
    case "infusionExtendEnd":
      return action.side === "right"
        ? { ...state, extendingInf: null, extInfHover: null }
        : { ...state, extendingInfLeft: null, extInfLeftHover: null }

    case "fluidExtendStart":
      return { ...state, extendingFluid: action.id }
    case "fluidExtendHover":
      return { ...state, extFluidHover: action.col }
    case "fluidExtendEnd":
      return { ...state, extendingFluid: null, extFluidHover: null }

    case "agentExtendStart":
      return { ...state, extendingAgent: action.startCol }
    case "agentExtendHover":
      return { ...state, extendHoverCol: action.col }
    case "agentExtendEnd":
      return { ...state, extendingAgent: null, extendHoverCol: null }

    case "dropTargetOver":
      return { ...state, dragOver: action.col }
    case "fluidDropTargetOver":
      return { ...state, fluidDragOver: action.col }
  }
}

export type TimetableDragActions = {
  infusionMoveStart: (move: InfusionBarMove) => void
  infusionMoveHover: (col: number) => void
  infusionMoveEnd: () => void
  ratePillStart: (move: RatePillMove) => void
  ratePillEnd: () => void
  infusionExtendStart: (id: string, side: DragSide) => void
  infusionExtendHover: (col: number, side: DragSide) => void
  infusionExtendEnd: (side: DragSide) => void
  fluidExtendStart: (id: string) => void
  fluidExtendHover: (col: number) => void
  fluidExtendEnd: () => void
  agentExtendStart: (startCol: number) => void
  agentExtendHover: (col: number) => void
  agentExtendEnd: () => void
  dropTargetOver: (col: number | null) => void
  fluidDropTargetOver: (col: number | null) => void
}

export function useTimetableDrag(): [TimetableDragState, TimetableDragActions] {
  const [state, dispatch] = useReducer(reduce, EMPTY)

  const actions = useMemo<TimetableDragActions>(() => ({
    infusionMoveStart: move => dispatch({ type: "infusionMoveStart", move }),
    infusionMoveHover: col => dispatch({ type: "infusionMoveHover", col }),
    infusionMoveEnd: () => dispatch({ type: "infusionMoveEnd" }),
    ratePillStart: move => dispatch({ type: "ratePillStart", move }),
    ratePillEnd: () => dispatch({ type: "ratePillEnd" }),
    infusionExtendStart: (id, side) => dispatch({ type: "infusionExtendStart", id, side }),
    infusionExtendHover: (col, side) => dispatch({ type: "infusionExtendHover", col, side }),
    infusionExtendEnd: side => dispatch({ type: "infusionExtendEnd", side }),
    fluidExtendStart: id => dispatch({ type: "fluidExtendStart", id }),
    fluidExtendHover: col => dispatch({ type: "fluidExtendHover", col }),
    fluidExtendEnd: () => dispatch({ type: "fluidExtendEnd" }),
    agentExtendStart: startCol => dispatch({ type: "agentExtendStart", startCol }),
    agentExtendHover: col => dispatch({ type: "agentExtendHover", col }),
    agentExtendEnd: () => dispatch({ type: "agentExtendEnd" }),
    dropTargetOver: col => dispatch({ type: "dropTargetOver", col }),
    fluidDropTargetOver: col => dispatch({ type: "fluidDropTargetOver", col }),
  }), [])

  return [state, actions]
}
