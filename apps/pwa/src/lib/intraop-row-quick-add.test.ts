import { describe, expect, it, vi } from "vitest"
import { dispatchRowQuickAdd, slotIsoTimestamp } from "./intraop-row-quick-add"

function callbacks() {
  return {
    openVitals: vi.fn(),
    openDrug: vi.fn(),
    openInfusion: vi.fn(),
    openFluid: vi.fn(),
    openAgent: vi.fn(),
    openGasSettings: vi.fn(),
    openEvent: vi.fn(),
  }
}

describe("dispatchRowQuickAdd", () => {
  it("routes vital and bp actions with the selected row timestamp", () => {
    const cb = callbacks()
    const start = new Date("2026-01-01T08:00:00.000Z")

    dispatchRowQuickAdd(start, 2, "vital", cb)
    dispatchRowQuickAdd(start, 3, "bp", cb)

    expect(cb.openVitals).toHaveBeenNthCalledWith(1, "full", "2026-01-01T08:10:00.000Z")
    expect(cb.openVitals).toHaveBeenNthCalledWith(2, "bp", "2026-01-01T08:15:00.000Z")
  })

  it("routes drug/fluid/agent/gas actions", () => {
    const cb = callbacks()
    const start = new Date("2026-01-01T08:00:00.000Z")

    dispatchRowQuickAdd(start, 1, "drug", cb)
    dispatchRowQuickAdd(start, 1, "infusion", cb)
    dispatchRowQuickAdd(start, 1, "fluid", cb)
    dispatchRowQuickAdd(start, 1, "agent", cb)
    dispatchRowQuickAdd(start, 1, "gas", cb)

    expect(cb.openDrug).toHaveBeenCalledWith("2026-01-01T08:05:00.000Z")
    expect(cb.openInfusion).toHaveBeenCalledWith("2026-01-01T08:05:00.000Z")
    expect(cb.openFluid).toHaveBeenCalledWith("2026-01-01T08:05:00.000Z")
    expect(cb.openAgent).toHaveBeenCalledWith("2026-01-01T08:05:00.000Z")
    expect(cb.openGasSettings).toHaveBeenCalledWith("2026-01-01T08:05:00.000Z")
  })

  it("routes event actions with the selected row Date", () => {
    const cb = callbacks()
    const start = new Date("2026-01-01T08:00:00.000Z")

    dispatchRowQuickAdd(start, 4, "event", cb)

    expect(cb.openEvent).toHaveBeenCalledOnce()
    expect(cb.openEvent.mock.calls[0][0].toISOString()).toBe("2026-01-01T08:20:00.000Z")
  })
})

describe("slotIsoTimestamp", () => {
  it("returns an ISO string for selected slots and undefined otherwise", () => {
    expect(slotIsoTimestamp(new Date("2026-01-01T08:00:00.000Z"))).toBe("2026-01-01T08:00:00.000Z")
    expect(slotIsoTimestamp(null)).toBeUndefined()
    expect(slotIsoTimestamp(undefined)).toBeUndefined()
  })
})
