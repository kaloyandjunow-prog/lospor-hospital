import { describe, expect, it } from "vitest"
import { isTransientNetworkError } from "./network-failure"

/**
 * The one decision both clients now share: is this a network hiccup, worth
 * queuing and retrying, or something else. Getting the abort case wrong is
 * what let a save that merely took too long be queued on the phone and lost
 * on the web for the same failure.
 */
describe("recognising a network hiccup, across runtimes", () => {
  it("treats a failed fetch as a network hiccup", () => {
    expect(isTransientNetworkError(new TypeError("Failed to fetch"))).toBe(true)
    expect(isTransientNetworkError(new TypeError("Network request failed"))).toBe(true)
  })

  /**
   * A browser abort throws a DOMException; React Native's fetch throws a
   * plain Error. Both name themselves "AbortError" and nothing else about
   * their shape can be relied on, which is why this checks the name on any
   * Error rather than a specific class.
   */
  it("treats a client-side timeout as a network hiccup, however the runtime named the error", () => {
    const rnStyleAbort = new Error("Aborted")
    rnStyleAbort.name = "AbortError"
    expect(isTransientNetworkError(rnStyleAbort)).toBe(true)
  })

  it("does not treat a server's answer as a network hiccup", () => {
    expect(isTransientNetworkError(new Error("Save failed (HTTP 422)"))).toBe(false)
  })

  it("does not treat an error merely named like an abort as one", () => {
    const notReallyAborted = new Error("AbortError: something else went wrong")
    expect(isTransientNetworkError(notReallyAborted)).toBe(false)
  })

  it("is false for anything that is not an Error at all", () => {
    expect(isTransientNetworkError("Failed to fetch")).toBe(false)
    expect(isTransientNetworkError(null)).toBe(false)
    expect(isTransientNetworkError(undefined)).toBe(false)
    expect(isTransientNetworkError({ name: "AbortError" })).toBe(false)
  })
})
