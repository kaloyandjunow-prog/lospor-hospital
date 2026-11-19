import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/notify", () => ({ actionSheet: vi.fn() }))
vi.mock("@/lib/preferences-context", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/preferences-context")>(),
  usePreferences: () => ({ tc: (key: string) => key, language: "en" }),
}))

import { render } from "@/test/render"
import type { RunningAgent } from "@/lib/use-intraop-running-state"
import { useAgentEntry } from "./use-agent-entry"

function harness(activeAgents: RunningAgent[]) {
  const save = vi.fn(async () => {})
  const setEntryTs = vi.fn()
  const setActiveAgents = vi.fn()
  let entry!: ReturnType<typeof useAgentEntry>
  function Harness() {
    entry = useAgentEntry(save as never, setEntryTs, activeAgents, setActiveAgents)
    return null
  }
  render(<Harness />)
  return { get entry() { return entry }, save, setEntryTs, setActiveAgents }
}

describe("changing the concentration of a running agent", () => {
  const sevo: RunningAgent = { name: "Sevoflurane", color: "#a855f7", percent: 1.5 }

  it("opens the agent sheet on that agent, with its current percent, at the row it was opened from", () => {
    const h = harness([sevo])
    act(() => h.entry.openAgent("2026-11-18T09:30:00.000Z", "Sevoflurane"))
    expect(h.entry.agOpen).toBe(true)
    expect(h.entry.agPick).toEqual({ name: "Sevoflurane", color: "#a855f7" })
    expect(h.entry.agPercent).toBe(1.5)
    expect(h.setEntryTs).toHaveBeenCalledWith("2026-11-18T09:30:00.000Z")
  })

  it("records the new percent as another start of the same agent, with no stop", async () => {
    const h = harness([sevo])
    act(() => h.entry.openAgent("2026-11-18T09:30:00.000Z", "Sevoflurane"))
    act(() => h.entry.setAgPercent(2))
    await act(async () => { h.entry.confirmAgent() })
    expect(h.save).toHaveBeenCalledTimes(1)
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({ type: "agent_start", name: "Sevoflurane", value: "2", agentMode: "concurrent" }),
      expect.anything(),
    )
  })

  it("starting an agent from the sheet without naming one leaves the choice open", () => {
    const h = harness([sevo])
    act(() => h.entry.openAgent("2026-11-18T09:30:00.000Z"))
    expect(h.entry.agOpen).toBe(true)
    expect(h.entry.agPick).toBeNull()
    expect(h.entry.agPercent).toBeNull()
  })
})
