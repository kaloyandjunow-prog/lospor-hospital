// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { TimetableData } from "@/components/IntraopTimetable"
import { useGasSettingsHandlers } from "./useGasSettingsHandlers"

const TAG = "card:Hypoxia / desaturation:oxygen"
const rect = {} as DOMRect
const running = { id: "run", startCol: 0, endCol: 8, fgf: 2, carrierGas: "air", fio2: 40 }

function setup(gasSettings: TimetableData["gasSettings"]) {
  let data = { gasSettings } as TimetableData
  const onChange = vi.fn((next: TimetableData) => { data = next })
  const hook = renderHook(() => useGasSettingsHandlers(data, onChange, { current: data }, { current: onChange }))
  return { hook, onChange, latest: () => data }
}

describe("a gas change made from a treatment card (10.2.0)", () => {
  it("carries the card's tag on the change it saves", () => {
    const { hook, latest } = setup([running])
    act(() => hook.result.current.openPickerForSeg(4, running as never, rect, TAG))
    act(() => { hook.result.current.setPickerFio2(100) })
    act(() => hook.result.current.applyGasChange("run"))
    expect(latest().gasSettings![0]!.settingsChanges).toEqual([expect.objectContaining({ col: 4, fio2: 100, suggestion: TAG })])
  })

  it("carries it on a run started from a card", () => {
    const { hook, latest } = setup([])
    act(() => hook.result.current.openPickerEmpty(2, rect, TAG))
    act(() => hook.result.current.startGas(2))
    expect(latest().gasSettings![0]).toMatchObject({ startCol: 2, suggestion: TAG })
  })

  it("does not leave the tag behind: a picker opened by hand afterwards saves an untagged change", () => {
    const { hook, latest } = setup([running])
    act(() => hook.result.current.openPickerForSeg(4, running as never, rect, TAG))
    act(() => hook.result.current.closeGasPicker())
    act(() => hook.result.current.openPickerForSeg(5, running as never, rect))
    act(() => hook.result.current.applyGasChange("run"))
    expect(latest().gasSettings![0]!.settingsChanges![0]).not.toHaveProperty("suggestion")
  })
})
