import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { render } from "@/test/render"

// The intraop screen stopped on opening a case in the 9.13.0 candidate: the
// autosave manager reports every step of every save, this hook re-rendered the
// whole screen for each report, and with the header's options that passed
// React's limit on nested updates. It must re-render only when what the chart
// shows changes.

const manager = vi.hoisted(() => {
  const listeners = new Set<(state: { caseId: string }) => void>()
  let current = { caseId: "case-1", queuedEventIds: [] as string[], sendingEventId: null as string | null, refused: [] as unknown[], queuedSections: [] as string[] }
  return {
    listeners,
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

import { useCaseSaveState, type CaseSaveState } from "./use-case-save-state"

describe("the case's save state on the phone", () => {
  it("re-renders only when something the chart shows changed", async () => {
    const seen: CaseSaveState[] = []
    function Harness() {
      seen.push(useCaseSaveState("case-1"))
      return null
    }
    await render(<Harness />)
    const settled = seen.length
    // Each report arrives on its own, as the manager's saves do.
    for (let step = 0; step < 60; step += 1) await act(async () => { manager.emit() })
    expect(seen.length).toBe(settled)

    await act(async () => { manager.set({ queuedEventIds: ["dose"] }); manager.emit() })
    expect(seen.length).toBe(settled + 1)
    expect(seen.at(-1)!.queuedEventIds).toEqual(["dose"])
    // The dismiss handed to the chart is the same function throughout.
    expect(seen.at(-1)!.dismissRefused).toBe(seen[0].dismissRefused)
  })
})
