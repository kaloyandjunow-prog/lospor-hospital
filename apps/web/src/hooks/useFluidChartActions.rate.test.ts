// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { TimetableData } from "@/components/IntraopTimetable"
import { useFluidChartActions } from "./useFluidChartActions"

// 10.8.0: a fluid's rate is changed by the same rule as every other kind -- the start cell edits the start,
// a cell with a change edits it, anywhere else adds a change.
const fluid = { id: "f1", name: "Ringer", category: "Crystalloids", color: "#06b6d4", startCol: 3, endCol: 12, rate: 500, fluidEntryMode: "RATE", rateChanges: [{ col: 9, ts: "t9", rate: 200, unit: "mL/h" }] }

function setup() {
  let data = { fluids: [fluid] } as unknown as TimetableData
  const onChange = vi.fn((next: TimetableData) => { data = next })
  const hook = renderHook(() => useFluidChartActions({
    dataRef: { current: data }, onChangeRef: { current: onChange }, nowCol: 11, tsForCol: (col: number) => `ts-${col}`, uid: () => "u", getFluidCategory: () => "Crystalloids",
  } as never))
  return { hook, latest: () => data.fluids![0] as unknown as { rate: number; rateChanges: { col: number; rate: number }[] } }
}

describe("a fluid's rate changed in a cell", () => {
  it("in the start cell replaces the start rate and keeps later changes", () => {
    const { hook, latest } = setup()
    act(() => hook.result.current.applyFluidRateChange("f1", 300, 3))
    expect(latest().rate).toBe(300)
    expect(latest().rateChanges).toEqual([expect.objectContaining({ col: 9, rate: 200 })])
  })

  it("in a cell with a change replaces it, never two in a cell", () => {
    const { hook, latest } = setup()
    act(() => hook.result.current.applyFluidRateChange("f1", 150, 9))
    expect(latest().rateChanges).toEqual([expect.objectContaining({ col: 9, rate: 150 })])
  })

  it("elsewhere adds a change from that cell", () => {
    const { hook, latest } = setup()
    act(() => hook.result.current.applyFluidRateChange("f1", 400, 6))
    expect(latest().rateChanges.map(change => [change.col, change.rate])).toEqual([[6, 400], [9, 200]])
  })
})
