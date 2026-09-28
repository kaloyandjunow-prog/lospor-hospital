import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { render } from "@/test/render"

// Watching mode on the phone (1.4.14 appliance test): a phone that had not
// taken over the case still planned a rate change and saved it. It is
// read-only now, as on the web: nothing is written, locally or to the server.

const server = vi.hoisted(() => ({
  online: true,
  saved: new Map<string, unknown>(),
  requests: [] as string[],
  // While set, the next POST waits for it: an entry "on its way".
  hold: null as null | Promise<void>,
}))

vi.mock("@/lib/autosave-manager", async () => {
  const { createAutosaveManager } = await import("@lospor/core/sync")
  const data = new Map<string, string>()
  const kv = {
    get: async (key: string) => data.get(key) ?? null,
    set: async (key: string, value: string) => { data.set(key, value) },
    delete: async (key: string) => { data.delete(key) },
  }
  const reply = (ok = true) => ({ ok, status: ok ? 200 : 503, revision: 1 })
  return {
    autosaveManager: createAutosaveManager({
      outbox: { kv, sendPatch: vi.fn(), classifyError: () => ({ kind: "network" }) },
      pendingEvents: {
        kv,
        postEvent: async (_caseId: string, event: { id?: unknown }) => {
          if (!server.online) throw new TypeError("offline")
          if (server.hold) await server.hold
          server.requests.push(`POST ${String(event.id)}`)
          server.saved.set(String(event.id), event)
          return reply()
        },
        isNetworkError: (error: unknown) => error instanceof TypeError,
      },
      eventMutations: {
        kv,
        send: async (operation: { kind: string; eventId: string; event?: unknown }) => {
          if (!server.online) throw new TypeError("offline")
          server.requests.push(`${operation.kind === "event.delete" ? "DELETE" : "PUT"} ${operation.eventId}`)
          if (operation.kind === "event.delete") {
            if (!server.saved.delete(operation.eventId)) return { ok: false, status: 404 }
          } else server.saved.set(operation.eventId, operation.event)
          return reply()
        },
        isNetworkError: (error: unknown) => error instanceof TypeError,
      },
    }),
  }
})
vi.mock("expo-haptics", () => ({ notificationAsync: vi.fn(async () => {}), NotificationFeedbackType: {} }))
const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }))
vi.mock("@/lib/notify", () => ({ notify: notifyMock }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ t: (key: string) => key, tc: (key: string) => key }) }))
vi.mock("@/lib/intraop-projection", () => ({ eventsToTimetable: () => ({}), roundDown5Min: (date: Date) => date }))

import { autosaveManager } from "@/lib/autosave-manager"
import type { LogEvent } from "@/lib/intraop-log-event"
import { useIntraopEventPersistence } from "./use-intraop-event-persistence"

async function mount(watching: boolean) {
  const logRef = { current: [] as LogEvent[] }
  const watchingRef = { current: watching }
  let api!: ReturnType<typeof useIntraopEventPersistence>
  function Harness() {
    const [log, setLog] = React.useState<LogEvent[]>([])
    api = useIntraopEventPersistence({
      caseId: "case-w", entryTs: null, setEntryTs: () => {}, log, logRef, startRef: { current: new Date("2026-09-27T12:00:00.000Z") },
      legacyWebLogNeedsSyncRef: { current: false }, baseIntraopUpdatedAtRef: { current: null },
      enqueueEventSave: operation => operation(), setLog, setTimetable: () => {}, setElapsedMs: () => {},
      setSyncState: () => {}, setLastSavedAt: () => {}, setPendingCount: () => {}, noteVitalsRef: { current: () => {} },
      watchingRef,
    })
    return null
  }
  await act(async () => { render(<Harness />) })
  return { api: () => api, logRef, watchingRef }
}

const dose = { type: "drug", name: "Ondansetron", dose: "4", unit: "mg" } as never

describe("a phone watching the case writes nothing", () => {
  it("refuses an entry and an edit, says why, and sends nothing", async () => {
    server.requests = []
    notifyMock.mockClear()
    const { api, logRef } = await mount(true)
    let entry: LogEvent | null | undefined
    await act(async () => { entry = await api().save(dose, "2026-09-27T12:10:00.000Z") })
    expect(entry).toBeNull()
    expect(logRef.current).toEqual([])
    let synced: boolean | undefined
    await act(async () => { synced = await api().syncLog([{ id: "x", ts: "2026-09-27T12:10:00.000Z", ...(dose as object) } as LogEvent]) })
    expect(synced).toBe(false)
    expect(logRef.current).toEqual([])
    await act(async () => { await autosaveManager.flushCase("case-w") })
    expect(server.requests).toEqual([])
    expect(notifyMock).toHaveBeenCalledWith("watchingMode", "watchingNoEdits")
  })

  it("an autofilled entry is refused without a notice; after taking over, entries save", async () => {
    server.requests = []
    notifyMock.mockClear()
    const { api, watchingRef } = await mount(true)
    let auto: LogEvent | null | undefined
    await act(async () => { auto = await api().save(dose, "2026-09-27T12:10:00.000Z", true) })
    expect(auto).toBeNull()
    expect(notifyMock).not.toHaveBeenCalled()

    watchingRef.current = false
    let entry: LogEvent | null | undefined
    await act(async () => { entry = await api().save(dose, "2026-09-27T12:15:00.000Z", true) })
    expect(entry).not.toBeNull()
    await act(async () => { await autosaveManager.flushCase("case-w") })
    expect(server.requests).toEqual([`POST ${entry!.id}`])
  })
})
