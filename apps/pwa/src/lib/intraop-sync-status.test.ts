import { describe, expect, it, vi } from "vitest"

import { createIntraopSyncStatusStore } from "./intraop-sync-status"

// The intraop save badge's store (coverage review 9.13.0). It exists so that
// saving does not re-render the whole intraop screen; a write that changes
// nothing must wake no one.

describe("the intraop save status store", () => {
  it("wakes subscribers only when something shown changed", () => {
    const store = createIntraopSyncStatusStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.set({ syncState: "saved", pendingCount: 0 })
    expect(listener).not.toHaveBeenCalled()
    store.set({ syncState: "saving", pendingCount: 1 })
    expect(listener).toHaveBeenCalledTimes(1)
    const snapshot = store.getSnapshot()
    store.set({ pendingCount: 1 })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).toBe(snapshot)
  })

  it("stops waking a subscriber that left", () => {
    const store = createIntraopSyncStatusStore()
    const listener = vi.fn()
    const leave = store.subscribe(listener)
    leave()
    store.set({ syncState: "offline" })
    expect(listener).not.toHaveBeenCalled()
    expect(store.getSnapshot().syncState).toBe("offline")
  })
})
