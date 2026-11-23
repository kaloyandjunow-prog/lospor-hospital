// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CASE_PRESENCE_HEARTBEAT_MS } from "@lospor/core/case-presence"
import { useCasePresence } from "./useCasePresence"

const answer = { people: [{ name: "Мария", you: true }, { name: "Иван", you: false }], screens: 2 }

describe("who has the case open", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(answer), { status: 200 })))
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it("reports the screen, keeps reporting, and leaves when the case closes", async () => {
    const { result, unmount } = renderHook(() => useCasePresence("case-1"))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current).toEqual(answer)
    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/cases/case-1/presence")
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "POST" })

    await act(async () => { await vi.advanceTimersByTimeAsync(CASE_PRESENCE_HEARTBEAT_MS) })
    expect(fetchMock.mock.calls.filter(call => (call[1] as RequestInit).method === "POST")).toHaveLength(2)

    unmount()
    expect(fetchMock.mock.calls.at(-1)![1]).toMatchObject({ method: "DELETE" })
  })

  it("does nothing without a case or while it is off", async () => {
    renderHook(() => useCasePresence(null))
    renderHook(() => useCasePresence("case-1", false))
    await act(async () => { await vi.advanceTimersByTimeAsync(CASE_PRESENCE_HEARTBEAT_MS) })
    expect(fetch).not.toHaveBeenCalled()
  })
})
