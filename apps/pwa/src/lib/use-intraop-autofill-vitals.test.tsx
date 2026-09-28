import React from "react"
import { act } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A phone set three minutes fast: the server's time is the device's minus the
// skew, which is what the server clock corrects for.
const clock = vi.hoisted(() => ({ skewMs: 0 }))
vi.mock("@/lib/server-clock", () => ({ serverNow: () => new Date(Date.now() - clock.skewMs) }))
vi.mock("@/lib/notify", () => ({ actionSheet: vi.fn(), notify: vi.fn() }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key }) }))

import { render } from "@/test/render"
import { useIntraopAutofillVitals } from "./use-intraop-autofill-vitals"
import type { LogEvent } from "./intraop-log-event"

const START = new Date("2026-09-28T08:00:00Z")
const at = (minutes: number, seconds = 0) => new Date(START.getTime() + minutes * 60_000 + seconds * 1000)
const log = [
  { id: "v0", type: "vital", ts: at(0).toISOString(), systolic: 120, diastolic: 70, heartRate: 80, spo2: 99 },
] as unknown as LogEvent[]

function Harness({ save }: { save: (event: unknown, ts: string, auto?: boolean) => Promise<void> }) {
  const logRef = React.useRef(log)
  const startRef = React.useRef<Date | null>(START)
  const endedAtRef = React.useRef<Date | null>(null)
  useIntraopAutofillVitals(true, true, true, false, log, logRef, startRef, save as never, { endedAtRef, onEndCase: () => {} })
  return null
}

describe("autofilled vitals follow the chart's now, not the phone's clock", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); clock.skewMs = 0 })

  it("does not fill the row the now line has not reached, on a phone set fast", async () => {
    clock.skewMs = 3 * 60_000
    // 08:04:40 by the server, in the 08:00 row; the phone reads 08:07:40.
    vi.setSystemTime(new Date(at(4, 40).getTime() + clock.skewMs))
    const saved: string[] = []
    render(<Harness save={async (_event, ts) => { saved.push(ts) }} />)

    // Run to 08:08 by the server: the 08:05 row is now, the 08:10 row is not.
    for (let tick = 0; tick < 20; tick++) {
      await act(async () => { vi.advanceTimersByTime(10_000) })
    }

    expect(saved.length).toBeGreaterThan(0)
    expect(saved.every(ts => Date.parse(ts) < at(10).getTime())).toBe(true)
  })

  it("fills the row that is now, on a phone set slow", async () => {
    // The row is judged on the server's clock; a plan judged on the phone's
    // called it the future, and the tick then moved past it for good.
    clock.skewMs = -3 * 60_000
    // 08:04:40 by the server, in the 08:00 row; the phone reads 08:01:40.
    vi.setSystemTime(new Date(at(4, 40).getTime() + clock.skewMs))
    const saved: string[] = []
    render(<Harness save={async (_event, ts) => { saved.push(ts) }} />)

    // Run to 08:08 by the server: the 08:05 row has begun.
    for (let tick = 0; tick < 20; tick++) {
      await act(async () => { vi.advanceTimersByTime(10_000) })
    }

    expect(saved.some(ts => Date.parse(ts) >= at(5).getTime() && Date.parse(ts) < at(10).getTime())).toBe(true)
  })
})
