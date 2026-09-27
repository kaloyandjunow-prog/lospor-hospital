import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { render } from "@/test/render"

// Deleting an entry on the phone, against the real autosave manager and a
// fake server (9.13.0 bug sweep). Deletion used to edit the unsent queue
// directly, outside the case's write lock: an entry deleted while it was being
// sent was saved anyway and came back on the next reload.

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
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ t: (key: string) => key, tc: (key: string) => key }) }))
vi.mock("@/lib/intraop-projection", () => ({ eventsToTimetable: () => ({}), roundDown5Min: (date: Date) => date }))

import { autosaveManager } from "@/lib/autosave-manager"
import type { LogEvent } from "@/lib/intraop-log-event"
import { useIntraopEventPersistence } from "./use-intraop-event-persistence"

async function mount() {
  const logRef = { current: [] as LogEvent[] }
  let api!: ReturnType<typeof useIntraopEventPersistence>
  function Harness() {
    const [log, setLog] = React.useState<LogEvent[]>([])
    api = useIntraopEventPersistence({
      caseId: "case-1", entryTs: null, setEntryTs: () => {}, log, logRef, startRef: { current: new Date("2026-09-27T12:00:00.000Z") },
      legacyWebLogNeedsSyncRef: { current: false }, baseIntraopUpdatedAtRef: { current: null },
      enqueueEventSave: operation => operation(), setLog, setTimetable: () => {}, setElapsedMs: () => {},
      setSyncState: () => {}, setLastSavedAt: () => {}, setPendingCount: () => {}, noteVitalsRef: { current: () => {} },
    })
    return null
  }
  await act(async () => { render(<Harness />) })
  return { api: () => api, logRef }
}

const dose = { type: "drug", name: "Ondansetron", dose: "4", unit: "mg" } as never

describe("deleting an entry on the phone", () => {
  it("an entry that never left the phone is cancelled there: nothing about it is ever sent", async () => {
    server.online = false
    server.requests = []
    const { api } = await mount()
    let entry: LogEvent | null = null
    await act(async () => { entry = await api().save(dose, "2026-09-27T12:10:00.000Z", true) })
    await act(async () => { await api().removeEvent(entry!) })
    server.online = true
    await act(async () => { await autosaveManager.flushCase("case-1") })
    expect(server.requests.filter(request => request.endsWith(entry!.id))).toEqual([])
    expect(server.saved.has(entry!.id)).toBe(false)
  })

  it("an entry deleted while it is being sent is deleted after it arrives, and stays deleted", async () => {
    server.online = true
    server.requests = []
    let release!: () => void
    server.hold = new Promise(resolve => { release = resolve })
    const { api } = await mount()
    let entry: LogEvent | null = null
    let saving!: Promise<unknown>
    await act(async () => {
      saving = api().save(dose, "2026-09-27T12:15:00.000Z", true).then(saved => { entry = saved })
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    // The POST is on its way; the clinician deletes the entry now.
    const id = (await autosaveManager.pendingEvents.loadPending("case-1"))[0].id
    let removing!: Promise<void>
    await act(async () => {
      removing = api().removeEvent({ ...(await autosaveManager.pendingEvents.loadPending("case-1"))[0], id } as LogEvent)
      await new Promise(resolve => setTimeout(resolve, 20))
      server.hold = null
      release()
      await saving
      await removing
    })
    await act(async () => { await autosaveManager.flushCase("case-1") })
    expect(entry).not.toBeNull()
    expect(server.requests.filter(request => request.endsWith(id))).toEqual([`POST ${id}`, `DELETE ${id}`])
    expect(server.saved.has(id)).toBe(false)
  })
})
