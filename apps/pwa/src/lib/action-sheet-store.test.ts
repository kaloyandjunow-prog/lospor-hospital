import { describe, expect, it, vi, beforeEach } from "vitest"
import { subscribeActionSheet, getActionSheetSnapshot, showActionSheet, dismissActionSheet } from "./action-sheet-store"

describe("action-sheet-store", () => {
  beforeEach(() => dismissActionSheet())

  it("starts empty", () => {
    expect(getActionSheetSnapshot()).toBeNull()
  })

  it("notifies subscribers on show and dismiss, and stops after unsubscribe", () => {
    const cb = vi.fn()
    const unsub = subscribeActionSheet(cb)

    showActionSheet({ title: "Event", actions: [{ label: "A" }] })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(getActionSheetSnapshot()?.actions[0].label).toBe("A")

    dismissActionSheet()
    expect(cb).toHaveBeenCalledTimes(2)
    expect(getActionSheetSnapshot()).toBeNull()

    unsub()
    showActionSheet({ actions: [] })
    expect(cb).toHaveBeenCalledTimes(2) // no longer notified
  })

  it("dismiss is a no-op when already empty", () => {
    const cb = vi.fn()
    const unsub = subscribeActionSheet(cb)
    dismissActionSheet()
    expect(cb).not.toHaveBeenCalled()
    unsub()
  })
})
