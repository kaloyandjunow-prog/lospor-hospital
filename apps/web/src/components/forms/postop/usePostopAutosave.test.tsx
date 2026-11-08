// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { usePostopAutosave } from "./usePostopAutosave"

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function harness(initial: ((data: unknown) => void) | undefined) {
  return renderHook(({ save }) => {
    const form = useForm({ defaultValues: { note: "" } })
    usePostopAutosave({ control: form.control, getValues: form.getValues, onAutoSave: save as never })
    return form
  }, { initialProps: { save: initial } })
}

describe("postop autosave", () => {
  it("saves a change once, a second and a half after it", () => {
    const save = vi.fn()
    const { result } = harness(save)
    act(() => { result.current.setValue("note", "edited") })
    act(() => { vi.advanceTimersByTime(1_400) })
    expect(save).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(200) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![0]).toMatchObject({ note: "edited" })
  })

  it("does not save because the page re-rendered with a new callback", () => {
    const { rerender } = harness(vi.fn())
    act(() => { vi.advanceTimersByTime(5_000) })
    const replacements = [vi.fn(), vi.fn(), vi.fn()]
    for (const save of replacements) {
      rerender({ save })
      act(() => { vi.advanceTimersByTime(3_000) })
    }
    expect(replacements.map(save => save.mock.calls.length)).toEqual([0, 0, 0])
  })

  it("does nothing without a callback, and hands a pending save to the newest one", () => {
    const none = harness(undefined)
    act(() => { none.result.current.setValue("note", "x") })
    act(() => { vi.advanceTimersByTime(3_000) })

    const old = vi.fn()
    const newest = vi.fn()
    const { result, rerender } = harness(old)
    act(() => { result.current.setValue("note", "edited") })
    rerender({ save: newest })
    act(() => { vi.advanceTimersByTime(1_700) })
    expect(old).not.toHaveBeenCalled()
    expect(newest).toHaveBeenCalledTimes(1)
  })
})
