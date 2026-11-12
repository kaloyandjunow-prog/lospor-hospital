// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { useApplyEventPatches } from "./useApplyEventPatches"

// An answer saved from the timeline reaches the form in the same moment it reaches the server, so the sidebar, the
// readiness check and the next suggestion do not wait for a reload (found 2026-11-11).

const answerOps = (patch: Record<string, unknown>): IntraopEventOps => ({
  add: [{ id: "a1", ts: "2026-11-11T19:43:24.131Z", recordedAt: "2026-11-11T19:43:24.131Z", type: "prompt_answer", intraopPatch: patch } as never],
  update: [], remove: [],
})

describe("useApplyEventPatches", () => {
  it("sets the technique in the form, then saves the event", async () => {
    const order: string[] = []
    const setValue = vi.fn((field: string) => { order.push(`form:${field}`) })
    const onEventOps = vi.fn(async () => { order.push("save") })
    const { result } = renderHook(() => useApplyEventPatches(setValue as never, onEventOps))
    await result.current?.(answerOps({ techniques: ["GENERAL_INHALATION"], techniqueSides: {} }))
    expect(setValue).toHaveBeenCalledWith("techniques", ["GENERAL_INHALATION"], { shouldDirty: true })
    expect(setValue).toHaveBeenCalledWith("techniqueSides", {}, { shouldDirty: true })
    expect(onEventOps).toHaveBeenCalledTimes(1)
    expect(order.at(-1)).toBe("save")
  })

  it("fills the airway an induction answer names, the way the airway panel would", async () => {
    const setValue = vi.fn()
    const { result } = renderHook(() => useApplyEventPatches(setValue as never, vi.fn()))
    await result.current?.(answerOps({ techniques: ["GENERAL_INHALATION"], airwayDevices: ["ORAL_ETT"], airwayDeviceEntries: [{ id: "x", device: "ORAL_ETT" }], oralTubeSize: 7.5, oralCuffed: true }))
    for (const field of ["techniques", "airwayDevices", "airwayDeviceEntries", "oralTubeSize", "oralCuffed"]) {
      expect(setValue, field).toHaveBeenCalledWith(field, expect.anything(), { shouldDirty: true })
    }
  })

  it("passes an operation with no patch straight through", async () => {
    const setValue = vi.fn()
    const onEventOps = vi.fn()
    const { result } = renderHook(() => useApplyEventPatches(setValue as never, onEventOps))
    await result.current?.({ add: [{ id: "d", ts: "2026-11-11T19:43:38.000Z", type: "drug", name: "Propofol" } as never], update: [], remove: [] })
    expect(setValue).not.toHaveBeenCalled()
    expect(onEventOps).toHaveBeenCalledTimes(1)
  })

  it("is nothing when the screen cannot save (read-only)", () => {
    const { result } = renderHook(() => useApplyEventPatches(vi.fn() as never, undefined))
    expect(result.current).toBeUndefined()
  })
})
