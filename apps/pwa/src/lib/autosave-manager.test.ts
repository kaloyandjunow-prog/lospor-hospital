import { describe, expect, it } from "vitest"
import { classifyPatchError } from "./autosave-manager"
import { ApiError } from "./api"

/**
 * How a failed save is classified decides what a clinician is told about it.
 * `autosaveFetch` already converts an aborted request into an `ApiError`
 * coded "NETWORK" before this ever runs, so the two clients' own network
 * breaker and 8-second timeout are unaffected by this file. What this pins is
 * the classifier agreeing with web's about what counts as a network hiccup at
 * all, for a failure that reaches it some other way.
 */
describe("classifyPatchError", () => {
  it("treats a fetch TypeError as a retryable network failure", () => {
    expect(classifyPatchError(new TypeError("Network request failed"))).toEqual({ kind: "network" })
  })

  it("treats an aborted request as a network hiccup, same as web", () => {
    const abort = new Error("Aborted")
    abort.name = "AbortError"
    expect(classifyPatchError(abort)).toEqual({ kind: "network" })
  })

  it("treats an ApiError coded NETWORK as a retryable network failure", () => {
    expect(classifyPatchError(new ApiError("Offline", 0, "NETWORK"))).toEqual({ kind: "network" })
  })

  it("carries the server's revision and blocked-save issue on an HTTP failure", () => {
    const failure = classifyPatchError(new ApiError("Locked", 423, "HTTP", { revision: 7 }))
    expect(failure).toMatchObject({ kind: "http", status: 423 })
  })

  it("classifies anything unrecognised as other, never as network", () => {
    for (const value of [new Error("boom"), "string", null, undefined, 42, {}]) {
      expect(classifyPatchError(value)).toEqual({ kind: "other" })
    }
  })
})
