import React from "react"
import { act } from "react-test-renderer"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"

import { render } from "@/test/render"
import { useIntraopRuntimeEffects } from "./use-intraop-runtime-effects"
import type { LogEvent } from "./intraop-log-event"

/**
 * The intraop screen ticks every 10 s. It used to publish new state on every
 * tick regardless of whether anything visible had changed — a new elapsed value
 * for a header that renders whole minutes, and a freshly re-projected timetable
 * for a grid laid out in 5-minute columns. Each tick re-rendered the whole
 * screen, all fourteen sheets included.
 *
 * These tests pin both halves: nothing published when nothing changed, and
 * still published when it genuinely did.
 */
function Harness({
  start,
  log,
  onElapsed,
  onTimetable,
}: {
  start: Date
  log: LogEvent[]
  onElapsed: () => void
  onTimetable: () => void
}) {
  const logRef = React.useRef(log)
  const startRef = React.useRef<Date | null>(start)
  logRef.current = log

  useIntraopRuntimeEffects({
    log,
    logRef,
    startRef,
    setElapsedMs: onElapsed as never,
    setTimetable: onTimetable as never,
  })
  return null
}

describe("intraop runtime tick", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it("does not republish when neither the minute nor the 5-minute column moved", () => {
    const start = new Date("2026-08-06T08:00:00Z")
    vi.setSystemTime(new Date("2026-08-06T08:00:00Z"))
    const onElapsed = vi.fn()
    const onTimetable = vi.fn()
    const log: LogEvent[] = []

    render(<Harness start={start} log={log} onElapsed={onElapsed} onTimetable={onTimetable} />)

    // First tick establishes a baseline and is expected to publish.
    act(() => { vi.advanceTimersByTime(10_000) })
    const elapsedAfterFirst = onElapsed.mock.calls.length
    const timetableAfterFirst = onTimetable.mock.calls.length
    expect(timetableAfterFirst).toBe(1)

    // 10 s → 20 s → 30 s: same whole minute, same 5-minute column.
    act(() => { vi.advanceTimersByTime(10_000) })
    act(() => { vi.advanceTimersByTime(10_000) })

    expect(onElapsed).toHaveBeenCalledTimes(elapsedAfterFirst)
    expect(onTimetable).toHaveBeenCalledTimes(timetableAfterFirst)
  })

  it("publishes elapsed time when the displayed minute changes", () => {
    const start = new Date("2026-08-06T08:00:00Z")
    vi.setSystemTime(new Date("2026-08-06T08:00:00Z"))
    const onElapsed = vi.fn()
    const onTimetable = vi.fn()

    render(<Harness start={start} log={[]} onElapsed={onElapsed} onTimetable={onTimetable} />)

    act(() => { vi.advanceTimersByTime(10_000) })
    onElapsed.mockClear()

    // Cross the minute boundary.
    act(() => { vi.advanceTimersByTime(50_000) })

    expect(onElapsed).toHaveBeenCalled()
  })

  it("re-projects when the 5-minute column advances", () => {
    const start = new Date("2026-08-06T08:00:00Z")
    vi.setSystemTime(new Date("2026-08-06T08:00:00Z"))
    const onTimetable = vi.fn()

    render(<Harness start={start} log={[]} onElapsed={vi.fn()} onTimetable={onTimetable} />)

    act(() => { vi.advanceTimersByTime(10_000) })
    onTimetable.mockClear()

    act(() => { vi.advanceTimersByTime(5 * 60_000) })

    expect(onTimetable).toHaveBeenCalled()
  })

  it("re-projects when the log changed, even inside the same column", () => {
    const start = new Date("2026-08-06T08:00:00Z")
    vi.setSystemTime(new Date("2026-08-06T08:00:00Z"))
    const onTimetable = vi.fn()
    const tree = render(
      <Harness start={start} log={[]} onElapsed={vi.fn()} onTimetable={onTimetable} />,
    )

    act(() => { vi.advanceTimersByTime(10_000) })
    onTimetable.mockClear()

    // A new event arrives; the column has not moved.
    const log = [{ id: "e1", kind: "note", ts: new Date("2026-08-06T08:00:05Z") }] as unknown as LogEvent[]
    act(() => {
      tree.update(
        <Harness start={start} log={log} onElapsed={vi.fn()} onTimetable={onTimetable} />,
      )
    })
    act(() => { vi.advanceTimersByTime(10_000) })

    expect(onTimetable).toHaveBeenCalled()
  })
})
