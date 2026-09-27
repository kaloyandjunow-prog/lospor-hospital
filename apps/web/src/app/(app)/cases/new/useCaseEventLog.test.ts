// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

// The web chart's only write path (coverage review 9.13.0): one set of Core
// operations per edit, staged in order -- removals, then edits, then new
// entries -- and a refusal said aloud and undone from the saved log.

const calls = vi.hoisted(() => ({ staged: [] as string[], refusal: null as null | ((r: { caseId: string; eventId: string; code: string | null }) => void) }))
const toastError = vi.hoisted(() => vi.fn())

vi.mock("sonner", () => ({ toast: { error: toastError } }))
vi.mock("@/lib/intraop-clock", () => ({ serverNow: () => new Date("2026-09-27T12:00:00.000Z") }))
vi.mock("@/lib/autosave-manager", () => ({
  autosaveManager: {
    getRevision: () => 4,
    stageEventMutation: vi.fn(async (operation: { kind: string; eventId: string }) => { calls.staged.push(`${operation.kind}:${operation.eventId}`) }),
    appendEvent: vi.fn(async (_caseId: string, event: { id: string }) => { calls.staged.push(`append:${event.id}`) }),
  },
  onEventRefused: (listener: typeof calls.refusal) => { calls.refusal = listener; return () => { calls.refusal = null } },
}))

import { useCaseEventLog } from "./useCaseEventLog"

const ev = (id: string, extra: Record<string, unknown> = {}) => ({ id, ts: "2026-09-27T11:00:00.000Z", type: "drug", name: "Fentanyl", ...extra })

beforeEach(() => {
  calls.staged = []
  toastError.mockReset()
})

describe("the web chart's event journal", () => {
  it("applies an edit in one state change and stages removals, then edits, then additions", async () => {
    const { result } = renderHook(() => useCaseEventLog({ current: "case-1" }, key => key))
    act(() => { result.current.setEventLog([ev("a"), ev("b")] as never) })
    await act(async () => {
      await result.current.applyEventOps({ add: [ev("c")], update: [ev("b", { dose: "50" })], remove: ["a"] } as never)
    })
    expect(calls.staged).toEqual(["event.delete:a", "event.upsert:b", "append:c"])
    expect(result.current.eventLog.map(event => event.id)).toEqual(["b", "c"])
  })

  it("two edits in one tick both land: each reads the log the one before wrote", async () => {
    const { result } = renderHook(() => useCaseEventLog({ current: "case-1" }, key => key))
    const apply = result.current.applyEventOps
    await act(async () => {
      await apply({ add: [ev("x")], update: [], remove: [] } as never)
      await apply({ add: [], update: [ev("x", { dose: "25" })], remove: [] } as never)
    })
    expect(result.current.eventLog).toEqual([expect.objectContaining({ id: "x", dose: "25" })])
    expect(calls.staged).toEqual(["append:x", "event.upsert:x"])
  })

  it("a refused change is said in the timeline's words and the saved log is read back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ intraop: { keyEvents: { log: [ev("server")] } } }) })))
    const { result } = renderHook(() => useCaseEventLog({ current: "case-1" }, key => key))
    act(() => { calls.refusal?.({ caseId: "case-1", eventId: "mine", code: "SUPERSEDED" }) })
    expect(toastError).toHaveBeenCalledWith("intraop.timelineRules.refused.SUPERSEDED")
    await waitFor(() => expect(result.current.eventLog.map(event => event.id)).toEqual(["server"]))
    vi.unstubAllGlobals()
  })

  it("an unknown refusal code gets the general message; another case's refusal is ignored", () => {
    renderHook(() => useCaseEventLog({ current: "case-1" }, key => key))
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })))
    act(() => { calls.refusal?.({ caseId: "case-2", eventId: "x", code: "SUPERSEDED" }) })
    expect(toastError).not.toHaveBeenCalled()
    act(() => { calls.refusal?.({ caseId: "case-1", eventId: "x", code: "SOMETHING_NEW" }) })
    expect(toastError).toHaveBeenCalledWith("case.timelineEditFailed")
    vi.unstubAllGlobals()
  })
})
