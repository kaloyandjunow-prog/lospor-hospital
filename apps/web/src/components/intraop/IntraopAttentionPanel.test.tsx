// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { applyIntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { INTRAOP_ATTENTION_SCENARIOS } from "@lospor/core/intraop-attention-scenarios"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }))

import { useIntraopAttention } from "@/lib/use-intraop-attention"
import { IntraopAttentionPanel } from "./IntraopAttentionPanel"

// The web app against Core's shared scenarios (9.13.0). The PWA runs the same
// scenarios; if either lists or writes differently, its own test fails.

describe.each(INTRAOP_ATTENTION_SCENARIOS)("$name", scenario => {
  const now = new Date(scenario.context.now)
  const endedAt = scenario.context.endedAt == null ? null : new Date(scenario.context.endedAt).toISOString()

  it("shows exactly the items Core lists, and each answer writes Core's operations", () => {
    vi.useFakeTimers({ now })
    try {
      const onEventOps = vi.fn()
      const { result } = renderHook(() => useIntraopAttention({ log: scenario.log, endedAt, timeZone: "Europe/Sofia", onEventOps }))
      expect(result.current.entries.map(entry => ({ key: entry.key, kind: entry.kind }))).toEqual(scenario.expected)

      render(<IntraopAttentionPanel entries={result.current.entries} onAnswer={result.current.answer} />)
      for (const resolution of scenario.resolutions) {
        onEventOps.mockClear()
        act(() => { fireEvent.click(screen.getByTestId(`attention-${resolution.action}-${resolution.key}`)) })
        const next = applyIntraopEventOps(scenario.log, onEventOps.mock.calls[0][0])
        for (const removed of resolution.removes ?? []) expect(next.some(event => event.id === removed)).toBe(false)
        for (const [id, fields] of Object.entries(resolution.updates ?? {})) {
          expect(next.find(event => event.id === id)).toMatchObject(fields)
        }
      }
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("a screen watching another screen's case", () => {
  it("shows the questions and cannot answer them", () => {
    const [scenario] = INTRAOP_ATTENTION_SCENARIOS
    vi.useFakeTimers({ now: new Date(scenario.context.now) })
    try {
      const onEventOps = vi.fn()
      const { result } = renderHook(() => useIntraopAttention({ log: scenario.log, onEventOps, readOnly: true }))
      expect(result.current.canAnswer).toBe(false)
      result.current.answer("stop", "stopped")
      expect(onEventOps).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("in Bulgarian", () => {
  it.each(INTRAOP_ATTENTION_SCENARIOS.filter(scenario => scenario.expected.length > 0))("$name says Core's Bulgarian line", async scenario => {
    const { intraopAttentionItems, intraopAttentionText } = await import("@lospor/core/intraop-attention")
    vi.useFakeTimers({ now: new Date(scenario.context.now) })
    try {
      const endedAt = scenario.context.endedAt == null ? null : new Date(scenario.context.endedAt).toISOString()
      const { result } = renderHook(() => useIntraopAttention({ log: scenario.log, endedAt, locale: "bg" }))
      const expected = intraopAttentionItems(scenario.log, scenario.context).map(item => intraopAttentionText(item, "bg"))
      expect(result.current.entries.map(entry => entry.label)).toEqual(expected)
      expect(expected.some(line => /[А-Яа-я]/.test(line))).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("refused changes on the web", () => {
  it("are listed at the entry's time in the case's zone, in Core's words", async () => {
    const saveState = await import("@/lib/use-case-save-state")
    const refused = [{ eventId: "stop", status: 412, at: "2026-09-27T12:50:00.000Z", change: "edit" as const, event: { id: "stop", ts: "2026-09-27T12:35:00.000Z", type: "infusion_stop", infId: "i" } }]
    const spy = vi.spyOn(saveState, "useCaseSaveState").mockReturnValue({ ...saveState.NO_SAVE_STATE, refused })
    try {
      const log = [{ id: "start", ts: "2026-09-27T12:00:00.000Z", type: "infusion_start", infId: "i", name: "Remifentanil", rate: "0.1", unit: "mcg/kg/min" }] as never[]
      const { result } = renderHook(() => useIntraopAttention({ caseId: "case-1", log, timeZone: "Europe/Sofia", locale: "bg" }))
      expect(result.current.refused).toEqual([{
        key: "stop-2026-09-27T12:50:00.000Z",
        time: "15:35",
        text: expect.stringMatching(/^Remifentanil · .+ \(промяна\) — по-късна промяна е направена на друг екран/),
      }])
    } finally {
      spy.mockRestore()
    }
  })
})
