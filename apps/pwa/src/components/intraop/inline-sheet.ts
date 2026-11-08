import type React from "react"
import { useSyncExternalStore } from "react"

/**
 * Where a suggestion card's row opens its own dosing controls (10.2.0): under
 * the row, inside the card, so the card never changes screen. The dose, fluid
 * and gas sheets all draw through Sheet; while a row holds the slot, Sheet
 * hands its content here instead of opening a modal, and the row draws it.
 * Nothing holds the slot unless a card row asked for it, so every other sheet
 * behaves as before.
 */
type State = { id: string | null; node: React.ReactNode; title: string; footer: React.ReactNode; close: (() => void) | null }

const EMPTY: State = { id: null, node: null, title: "", footer: null, close: null }
let state: State = EMPTY
const listeners = new Set<() => void>()
const emit = (next: State) => { state = next; listeners.forEach(listener => listener()) }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export const inlineSheet = {
  get: (): State => state,
  /** The row that asked: the next content a sheet publishes is drawn under it. */
  activate: (id: string) => emit({ ...EMPTY, id }),
  /** What the open sheet shows now; ignored when no row holds the slot. */
  publish: (content: Omit<State, "id">) => { if (state.id) emit({ id: state.id, ...content }) },
  /** The sheet closed, or the card did: the slot is free. */
  release: () => { if (state.id !== null || state.node) emit(EMPTY) },
  /** Folds the controls away by closing the sheet that holds them. */
  fold: () => { const close = state.close; emit(EMPTY); close?.() },
}

/** Which row holds the slot. Only the id: a sheet publishing new content does not re-render its own Sheet. */
export const useInlineSheetId = () => useSyncExternalStore(subscribe, () => state.id, () => null)

export const useInlineSheet = () => useSyncExternalStore(subscribe, () => state, () => EMPTY)
