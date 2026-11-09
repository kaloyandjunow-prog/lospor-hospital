import React from "react"
import { describe, expect, it, vi } from "vitest"
import { parseIntraopAutomation } from "@lospor/core/intraop-automation"
import type { VitalQuestionContext } from "@lospor/core/vital-questions"
import { act } from "react-test-renderer"
import { render } from "@/test/render"
import type { LogEvent } from "@/lib/intraop-log-event"
import { useIntraopAttention } from "@/lib/use-intraop-attention"

const vitals: VitalQuestionContext = {
  settings: parseIntraopAutomation({ enabled: true, vitalQuestions: { enabled: true } }),
  stats: null,
  ageDays: 58 * 365,
  keepLogging: true,
}

const log = [
  { id: "low-hr", type: "vital", ts: "2026-11-01T06:30:00.000Z", heartRate: 44, systolic: 118, diastolic: 70 },
  { id: "vq-bradycardia-low-hr", type: "complication", ts: "2026-11-01T06:30:00.000Z", label: "Bradycardia", color: "#ef4444", complicationSource: "vitals", triggerReadingId: "low-hr" },
  { id: "back-hr", type: "vital", ts: "2026-11-01T06:40:00.000Z", heartRate: 72, systolic: 120, diastolic: 72 },
] as LogEvent[]

describe("closing an episode from the vitals questions", () => {
  it("keeps the whole chart when the screen has only just loaded it", async () => {
    // The screen copies the log into logRef in a later effect: on a fresh
    // load the closing runs while logRef is still empty.
    const logRef = { current: [] as LogEvent[] }
    const syncLog = vi.fn(async (next: LogEvent[]) => { logRef.current = next; return true })
    function Harness() {
      useIntraopAttention({ log, logRef, endedAtRef: { current: null }, syncLog, resyncActiveRef: { current: () => {} }, vitals })
      return null
    }
    render(<Harness />)
    await Promise.resolve()

    expect(syncLog).toHaveBeenCalledTimes(1)
    const saved = syncLog.mock.calls[0][0]
    expect(saved.map(event => event.id)).toEqual(log.map(event => event.id))
    expect(saved.find(event => event.id === "vq-bradycardia-low-hr")?.endTs).toBe("2026-11-01T06:40:00.000Z")
  })

  it("passes a newly answered vital question to the durable log save", async () => {
    const initial: LogEvent[] = [
      { id: "low-hr-new", type: "vital", ts: "2026-11-01T06:30:00.000Z", heartRate: 44 },
    ]
    const logRef = { current: initial }
    const syncLog = vi.fn(async (next: LogEvent[]) => {
      logRef.current = next
      return true
    })
    let attention!: ReturnType<typeof useIntraopAttention>
    function Harness() {
      attention = useIntraopAttention({
        log: initial,
        logRef,
        endedAtRef: { current: null },
        syncLog,
        resyncActiveRef: { current: () => {} },
        vitals,
      })
      return null
    }
    render(<Harness />)
    await act(async () => { await attention.resolve("vital:bradycardia:low-hr-new", "log_complication") })

    expect(syncLog).toHaveBeenCalledTimes(1)
    expect(syncLog.mock.calls[0][0]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "complication",
        complicationSource: "vitals",
        triggerReadingId: "low-hr-new",
      }),
    ]))
  })
})
