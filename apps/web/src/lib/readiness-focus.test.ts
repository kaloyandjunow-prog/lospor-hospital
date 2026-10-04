// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"

import { scrollToReadiness } from "./readiness-focus"

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = "" })

describe("scrolling to what a readiness item names", () => {
  it("scrolls the section that carries the item's name", () => {
    vi.useFakeTimers()
    document.body.innerHTML = `<section data-readiness="vitals medications"></section>`
    const section = document.querySelector("section") as HTMLElement & { scrollIntoView: () => void }
    section.scrollIntoView = vi.fn()
    scrollToReadiness("medications")
    vi.advanceTimersByTime(50)
    expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" })
  })

  // The scroll runs after a delay, and jsdom has no scrollIntoView: it threw
  // after a form test had finished and failed CI as an unhandled error.
  it("does nothing, rather than throw, where the element cannot scroll", () => {
    vi.useFakeTimers()
    document.body.innerHTML = `<section data-readiness="vitals"></section>`
    scrollToReadiness("vitals")
    expect(() => vi.advanceTimersByTime(50)).not.toThrow()
  })
})
