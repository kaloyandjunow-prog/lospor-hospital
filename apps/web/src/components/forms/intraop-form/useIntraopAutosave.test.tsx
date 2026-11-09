// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { useRef } from "react"
import { useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useIntraopAutosave } from "./useIntraopAutosave"

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function harness(initial: (data: unknown) => void) {
  return renderHook(({ save }) => {
    const form = useForm({ defaultValues: { note: "" } })
    // Refs are stable in the page; a fresh object each render here would restart the effect for the wrong reason.
    const airway = useRef(false)
    const vascular = useRef(false)
    useIntraopAutosave({
      control: form.control as never,
      getValues: form.getValues as never,
      onAutoSave: save as never,
      atomicAirwayEventPendingRef: airway,
      atomicVascularEventPendingRef: vascular,
    })
    return form
  }, { initialProps: { save: initial } })
}

describe("intraop autosave", () => {
  it("saves a change once, a second after it", () => {
    const save = vi.fn()
    const { result } = harness(save)
    act(() => { result.current.setValue("note", "first") })
    act(() => { vi.advanceTimersByTime(900) })
    expect(save).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(200) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![0]).toMatchObject({ note: "first" })
  })

  it("does not save because the page re-rendered with a new callback and nothing changed", () => {
    const first = vi.fn()
    const { rerender } = harness(first)
    act(() => { vi.advanceTimersByTime(5_000) })
    // The form's own first settling may save once; what is under test is what happens after it.
    const settled = first.mock.calls.length
    // The page passes a new arrow on every render. Each used to restart the effect and, a second later, save: the
    // save changed the page's state, the page re-rendered, and the loop ran about every second and a half (11.0).
    const replacements = [vi.fn(), vi.fn(), vi.fn()]
    for (const save of replacements) {
      rerender({ save })
      act(() => { vi.advanceTimersByTime(2_000) })
    }
    expect(first).toHaveBeenCalledTimes(settled)
    expect(replacements.map(save => save.mock.calls.length)).toEqual([0, 0, 0])
  })

  it("hands a pending save to the newest callback", () => {
    const old = vi.fn()
    const newest = vi.fn()
    const { result, rerender } = harness(old)
    act(() => { result.current.setValue("note", "edited") })
    rerender({ save: newest })
    act(() => { vi.advanceTimersByTime(1_200) })
    expect(old).not.toHaveBeenCalled()
    expect(newest).toHaveBeenCalledTimes(1)
  })
})
