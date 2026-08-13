// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useUnsavedCaseWarning } from "./useUnsavedCaseWarning"

function Guard({ enabled }: { enabled: boolean }) {
  useUnsavedCaseWarning(enabled)
  return null
}

describe("useUnsavedCaseWarning", () => {
  it("prevents unload while an unsaved new case has clinical input", () => {
    render(<Guard enabled />)
    const event = new Event("beforeunload", { cancelable: true })
    expect(window.dispatchEvent(event)).toBe(false)
    expect(event.defaultPrevented).toBe(true)
  })

  it("does not prevent unload once the case is safe or still untouched", () => {
    const { rerender } = render(<Guard enabled={false} />)
    const untouched = new Event("beforeunload", { cancelable: true })
    expect(window.dispatchEvent(untouched)).toBe(true)

    rerender(<Guard enabled />)
    rerender(<Guard enabled={false} />)
    const saved = new Event("beforeunload", { cancelable: true })
    expect(window.dispatchEvent(saved)).toBe(true)
  })

  it("does not write clinical data to browser storage", () => {
    const local = vi.spyOn(Storage.prototype, "setItem")
    render(<Guard enabled />)
    expect(local).not.toHaveBeenCalled()
  })
})
