import { describe, expect, it, vi } from "vitest"

import { createStableRenderModel } from "./use-stable-render-model"

describe("stable render model", () => {
  it("preserves model identity when only callback implementations change", () => {
    const model = createStableRenderModel<{
      tab: { value: number; onPress: () => void }
    }>()
    const firstCallback = vi.fn()
    const secondCallback = vi.fn()

    const first = model.update({ tab: { value: 1, onPress: firstCallback } })
    const second = model.update({ tab: { value: 1, onPress: secondCallback } })

    expect(second).toBe(first)
    expect(second.tab).toBe(first.tab)
    second.tab.onPress()
    expect(firstCallback).not.toHaveBeenCalled()
    expect(secondCallback).toHaveBeenCalledOnce()
  })

  it("changes only the branch whose clinical value changed", () => {
    const model = createStableRenderModel<{
      tab: { value: number; onPress: () => void }
      sheet: { visible: boolean; onClose: () => void }
    }>()

    const first = model.update({
      tab: { value: 1, onPress: () => {} },
      sheet: { visible: false, onClose: () => {} },
    })
    const second = model.update({
      tab: { value: 2, onPress: () => {} },
      sheet: { visible: false, onClose: () => {} },
    })

    expect(second).not.toBe(first)
    expect(second.tab).not.toBe(first.tab)
    expect(second.sheet).toBe(first.sheet)
  })

  it("keeps ref objects intact", () => {
    const model = createStableRenderModel<{ inputRef: { current: string | null } }>()
    const inputRef = { current: "first" }
    const first = model.update({ inputRef })
    inputRef.current = "second"
    const second = model.update({ inputRef })

    expect(second).toBe(first)
    expect(second.inputRef).toBe(inputRef)
    expect(second.inputRef.current).toBe("second")
  })
})
