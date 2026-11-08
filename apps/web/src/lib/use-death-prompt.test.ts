// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { LogEvent } from "@lospor/core/intraop-types"
import { DEATH_EVENT_LABEL, useDeathPrompt } from "./use-death-prompt"

const death: LogEvent = { id: "d", ts: "2026-11-02T10:00:00.000Z", type: "clinical_event", label: DEATH_EVENT_LABEL }
const other: LogEvent = { id: "o", ts: "2026-11-02T09:00:00.000Z", type: "clinical_event", label: "Intubated" }

describe("a death charted in theatre", () => {
  it("sets the destination and offers End case once, for a death charted on this screen", () => {
    const onDeath = vi.fn()
    const { result, rerender } = renderHook(({ log }) => useDeathPrompt(log, true, onDeath), { initialProps: { log: [other] } })
    expect(result.current[0]).toBe(false)
    rerender({ log: [other, death] })
    expect(onDeath).toHaveBeenCalledTimes(1)
    expect(result.current[0]).toBe(true)
    rerender({ log: [other, death, { ...other, id: "o2" }] })
    expect(onDeath).toHaveBeenCalledTimes(1)
  })

  it("asks nothing for a death already on the case, or on a watching screen", () => {
    const onDeath = vi.fn()
    renderHook(() => useDeathPrompt([death], true, onDeath))
    const watching = renderHook(({ log }) => useDeathPrompt(log, false, onDeath), { initialProps: { log: [other] } })
    watching.rerender({ log: [other, death] })
    expect(onDeath).not.toHaveBeenCalled()
  })
})
