import React from "react"
import { act } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { render } from "@/test/render"
import { useIntraopTimetableViewport } from "./use-intraop-timetable-viewport"
import { eventsToTimetable } from "./intraop-projection"
import type { LogEvent } from "./intraop-log-event"

/**
 * The chart of an ended case, reopened later (1.4.13 appliance test: case
 * 2026-0010, 14:43-15:14, opened two days on). It was laid out to now: some
 * 500 empty rows after the case, the tab opened on them, and it was pulled
 * back down to "now" every five minutes.
 */

const START = new Date("2026-09-26T11:43:42Z")
const END = new Date("2026-09-26T12:14:34Z")
const log = [
  { id: "v", type: "vital", ts: "2026-09-26T11:48:00Z", systolic: 118, diastolic: 72 },
  { id: "d", type: "drug", ts: "2026-09-26T11:53:00Z", name: "Rocuronium", dose: "50", unit: "mg" },
] as unknown as LogEvent[]

type Viewport = ReturnType<typeof useIntraopTimetableViewport>

function Harness({ endedAt, scrollToIndex, onViewport }: {
  endedAt: Date | null
  scrollToIndex: (params: { index: number; viewPosition?: number }) => void
  onViewport: (viewport: Viewport) => void
}) {
  const startRef = React.useRef<Date | null>(START)
  const endedAtRef = React.useRef<Date | null>(endedAt)
  endedAtRef.current = endedAt
  const listRef = React.useRef({ scrollToIndex } as never)
  const tabLayouts = React.useRef({})
  const tabRailRef = React.useRef(null)
  const timetable = eventsToTimetable(log, new Date("2026-09-26T11:40:00Z"), endedAt ?? new Date(), endedAt)
  onViewport(useIntraopTimetableViewport({
    log, timetable, startRef, endedAtRef, verticalTimetableRef: listRef, tab: "log", setTab: () => {},
    expandedRow: null, tabLayouts, tabRailRef, screenWidth: 390,
  }))
  return null
}

describe("the chart of an ended case", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-28T04:26:00Z"))
  })
  afterEach(() => { vi.useRealTimers() })

  it("stops at the end, has no now row, and opens with the end at the bottom", () => {
    const scrollToIndex = vi.fn()
    let viewport!: Viewport
    render(<Harness endedAt={END} scrollToIndex={scrollToIndex} onViewport={v => { viewport = v }} />)
    act(() => { vi.advanceTimersByTime(100) })

    // 11:40 grid: the end (12:14) is row 6; six rows follow it, not ~570.
    expect(viewport.chartRows).toHaveLength(13)
    expect(viewport.currentCol).toBe(-1)
    expect(scrollToIndex).toHaveBeenCalledTimes(1)
    expect(scrollToIndex).toHaveBeenCalledWith({ index: 6, animated: false, viewPosition: 1 })

    // Five minutes on, nothing pulls it anywhere.
    act(() => { vi.advanceTimersByTime(5 * 60_000) })
    expect(scrollToIndex).toHaveBeenCalledTimes(1)
  })

  it("a live case still opens at now and has its now row", () => {
    vi.setSystemTime(new Date("2026-09-26T12:05:00Z"))
    const scrollToIndex = vi.fn()
    let viewport!: Viewport
    render(<Harness endedAt={null} scrollToIndex={scrollToIndex} onViewport={v => { viewport = v }} />)
    act(() => { vi.advanceTimersByTime(100) })

    expect(viewport.currentCol).toBe(5)
    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 5, animated: false, viewPosition: 0.35 })
  })
})
