// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useAgentHandlers } from "./useAgentHandlers"
import type { AgentSegment, TimetableData } from "@/components/IntraopTimetable"

// 10.8.0: another agent running where a new one starts is asked about first (switch, both, cancel), as on the phone.
const sevo = { name: "Sevoflurane", startCol: 1, endCol: 6, percent: 2 } as AgentSegment
const base = { agents: [sevo], vitals: {}, drugs: [], infusions: [], fluids: [] } as unknown as TimetableData

function setup(askSwitch?: Parameters<typeof useAgentHandlers>[5]) {
  const onChange = vi.fn()
  const dataRef = { current: base }
  const onChangeRef = { current: onChange }
  const hook = renderHook(() => useAgentHandlers(base, onChange, dataRef, onChangeRef, 6, askSwitch))
  return { hook, onChange }
}

describe("starting an agent beside a running one", () => {
  it("asks first and writes nothing until it is answered", () => {
    const ask = vi.fn()
    const { hook, onChange } = setup(ask)
    act(() => hook.result.current.startAgent(3, "Desflurane", 4))
    expect(ask).toHaveBeenCalledTimes(1)
    expect(ask.mock.calls[0]![0]).toEqual([sevo])
    expect(onChange).not.toHaveBeenCalled()
  })

  it("Switch stops the running agent where the new one starts; Both leaves it running", () => {
    for (const stopOthers of [true, false]) {
      const ask = vi.fn()
      const { hook, onChange } = setup(ask)
      act(() => hook.result.current.startAgent(3, "Desflurane", 4))
      act(() => ask.mock.calls[0]![1](stopOthers))
      const written = onChange.mock.calls[0]![0].agents as AgentSegment[]
      expect(written.find(agent => agent.name === "Desflurane")).toMatchObject({ startCol: 3, percent: 4 })
      const old = written.find(agent => agent.name === "Sevoflurane")!
      expect(!!old.stopped).toBe(stopOthers)
      if (stopOthers) expect(old.endCol).toBe(3)
    }
  })

  it("writes at once when nothing else runs there", () => {
    const ask = vi.fn()
    const { hook, onChange } = setup(ask)
    act(() => hook.result.current.startAgent(0, "Desflurane", 4))
    expect(ask).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
