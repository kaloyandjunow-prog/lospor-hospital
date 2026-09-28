import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { render } from "@/test/render"

// Saving and then deleting or editing before the screen re-renders (coverage
// review 9.13.0). Answering a timeline question or an End case step can follow
// a save within one tick; the diff used the log as last rendered, so a delete
// sent the just-saved entry's deletion with it.

const staged = vi.hoisted(() => [] as { kind: string; eventId: string }[])

vi.mock("expo-haptics", () => ({ notificationAsync: vi.fn(async () => {}), NotificationFeedbackType: {} }))
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ t: (key: string) => key, tc: (key: string) => key }) }))
vi.mock("@/lib/intraop-projection", () => ({ eventsToTimetable: () => ({}), roundDown5Min: (date: Date) => date }))
vi.mock("@/lib/pending-intraop-events", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/pending-intraop-events")>()),
  loadPendingIntraopEvents: vi.fn(async () => []),
  storePendingIntraopEvents: vi.fn(async () => {}),
}))
vi.mock("@/lib/autosave-manager", () => ({
  autosaveManager: {
    getRevision: () => 1,
    setRevision: vi.fn(),
    appendEvent: vi.fn(async () => {}),
    stageEventMutation: vi.fn(async (operation: { kind: string; eventId: string }) => { staged.push({ kind: operation.kind, eventId: operation.eventId }) }),
    eventMutations: { load: async () => [] },
    getState: () => ({ status: "saved" }),
  },
}))

import type { LogEvent } from "@/lib/intraop-log-event"
import { useIntraopEventPersistence } from "./use-intraop-event-persistence"

const start = new Date("2026-09-27T12:00:00.000Z")

async function mount(initial: LogEvent[]) {
  const logRef = { current: initial }
  let persistence!: ReturnType<typeof useIntraopEventPersistence>
  function Harness() {
    const [log, setLog] = React.useState(initial)
    persistence = useIntraopEventPersistence({
      caseId: "case-1", entryTs: null, setEntryTs: () => {}, log, logRef, startRef: { current: start },
      legacyWebLogNeedsSyncRef: { current: false }, baseIntraopUpdatedAtRef: { current: null },
      enqueueEventSave: operation => operation(), setLog, setTimetable: () => {}, setElapsedMs: () => {},
      setSyncState: () => {}, setLastSavedAt: () => {}, setPendingCount: () => {}, noteVitalsRef: { current: () => {} },
    })
    return null
  }
  await act(async () => { render(<Harness />) })
  return { logRef, persistence: () => persistence }
}

const dose: LogEvent = { id: "old", ts: "2026-09-27T12:05:00.000Z", type: "drug", name: "Fentanyl", dose: "100", unit: "mcg" } as LogEvent

describe("a save followed at once by a deletion", () => {
  it("deletes only what was asked, never the entry just saved", async () => {
    staged.length = 0
    const { logRef, persistence } = await mount([dose])
    // The save and the deletion run on the same rendered hook, before any re-render.
    const api = persistence()
    let saved: LogEvent | null = null
    await act(async () => {
      saved = await api.save({ type: "drug", name: "Ondansetron", dose: "4", unit: "mg" } as never, "2026-09-27T12:10:00.000Z", true)
      await api.removeEvent(dose)
    })
    expect(saved).not.toBeNull()
    expect(logRef.current.map(event => event.id)).toEqual([saved!.id])
    expect(staged.filter(item => item.kind === "event.delete").map(item => item.eventId)).toEqual(["old"])
    expect(staged.some(item => item.eventId === saved!.id)).toBe(false)
  })
})
