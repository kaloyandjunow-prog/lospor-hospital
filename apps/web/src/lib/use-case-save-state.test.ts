// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// The web chart re-renders for its save state only when what it shows changes
// (9.13.0). The autosave manager reports every step of every save; a
// re-render of the whole chart per report is what stopped the PWA.

const manager = vi.hoisted(() => {
  const listeners = new Set<(state: { caseId: string }) => void>()
  let current = { caseId: "case-1", queuedEventIds: [] as string[], sendingEventId: null as string | null, refused: [] as unknown[], queuedSections: [] as string[] }
  return {
    set(next: Partial<typeof current>) { current = { ...current, ...next } },
    emit() { for (const listener of listeners) listener({ ...current }) },
    autosaveManager: {
      getState: () => ({ ...current, queuedEventIds: [...current.queuedEventIds], refused: [...current.refused], queuedSections: [...current.queuedSections] }),
      refreshPending: async () => 0,
      dismissRefused: vi.fn(async () => {}),
      subscribe(listener: (state: { caseId: string }) => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  }
})
vi.mock("@/lib/autosave-manager", () => ({ autosaveManager: manager.autosaveManager }))

import { useCaseSaveState } from "./use-case-save-state"

describe("the web chart's save state", () => {
  it("is the same object until something shown changes", () => {
    const { result } = renderHook(() => useCaseSaveState("case-1"))
    const first = result.current
    for (let step = 0; step < 20; step += 1) act(() => { manager.emit() })
    expect(result.current).toBe(first)
    act(() => { manager.set({ sendingEventId: "dose" }); manager.emit() })
    expect(result.current).not.toBe(first)
    expect(result.current.sendingEventId).toBe("dose")
    expect(result.current.dismissRefused).toBe(first.dismissRefused)
  })
})
