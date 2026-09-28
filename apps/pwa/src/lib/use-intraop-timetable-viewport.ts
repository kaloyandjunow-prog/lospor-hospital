import { useEffect, useMemo, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react"
import { FlatList, PanResponder, ScrollView } from "react-native"

import type { TimetableData } from "@/components/IntraopTimetable"
import type { LogEvent } from "@/lib/intraop-log-event"
import {
  computeVerticalTimetableWindow,
  roundDown5Min,
  safeTimetableScrollIndex,
  timetableTabOpeningScroll,
} from "@/lib/intraop-projection"
import {
  adjacentIntraopTab,
  centeredTabRailScrollX,
  intraopTabSwipeDirection,
  type IntraopTab,
} from "@/lib/intraop-tabs"

type UseIntraopTimetableViewportArgs = {
  log: LogEvent[]
  timetable: TimetableData
  startRef: MutableRefObject<Date | null>
  /** The case end once it has ended; the chart then stops at it rather than at now. */
  endedAtRef: MutableRefObject<Date | null>
  verticalTimetableRef: RefObject<FlatList<number> | null>
  tab: IntraopTab
  setTab: Dispatch<SetStateAction<IntraopTab>>
  expandedRow: number | null
  tabLayouts: MutableRefObject<Partial<Record<string, { x: number; width: number }>>>
  tabRailRef: RefObject<ScrollView | null>
  screenWidth: number
}

export function useIntraopTimetableViewport({
  log,
  timetable,
  startRef,
  endedAtRef,
  verticalTimetableRef,
  tab,
  setTab,
  expandedRow,
  tabLayouts,
  tabRailRef,
  screenWidth,
}: UseIntraopTimetableViewportArgs) {
  const prevCurrentColRef = useRef(-1)
  const chartStart = startRef.current ? roundDown5Min(startRef.current) : new Date()
  // An ended case is laid out to its end, not to now. Laid out to now, a case
  // reopened two days later had some 500 empty rows after it, opened on them,
  // and was pulled back down to "now" every five minutes (1.4.13 appliance
  // test). It has no now row either: the orange line would mark the end as now.
  const endedAt = endedAtRef.current
  const { currentCol: clockCol, nowSlotPercent, eventRows, lastEventCol, chartRows } =
    computeVerticalTimetableWindow(log, timetable, chartStart, endedAt ?? undefined)
  const currentCol = endedAt ? -1 : clockCol

  function jumpVerticalTimetableToNow() {
    const safeIdx = safeTimetableScrollIndex(clockCol, chartRows.length)
    if (safeIdx >= 0) {
      verticalTimetableRef.current?.scrollToIndex({ index: safeIdx, animated: true, viewPosition: 0.35 })
    }
  }

  useEffect(() => {
    if (tab !== "log" || !startRef.current) return
    const { index, viewPosition } = timetableTabOpeningScroll(lastEventCol, clockCol, chartRows.length, !!endedAt)
    if (index < 0) return
    const timer = setTimeout(() => {
      verticalTimetableRef.current?.scrollToIndex({ index, animated: false, viewPosition })
    }, 80)
    return () => clearTimeout(timer)
  }, [chartRows.length, clockCol, endedAt, lastEventCol, startRef, tab, verticalTimetableRef])

  useEffect(() => {
    if (tab !== "log" || expandedRow !== null || !startRef.current) return
    if (prevCurrentColRef.current === currentCol) return
    prevCurrentColRef.current = currentCol
    const safeIdx = safeTimetableScrollIndex(currentCol, chartRows.length)
    if (safeIdx >= 0) {
      verticalTimetableRef.current?.scrollToIndex({ index: safeIdx, animated: true, viewPosition: 0.35 })
    }
  }, [chartRows.length, currentCol, expandedRow, startRef, tab, verticalTimetableRef])

  const tabSwipeResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, { dx, dy }) => intraopTabSwipeDirection(dx, dy) !== null,
    onPanResponderRelease: (_, { dx, dy }) => {
      const direction = intraopTabSwipeDirection(dx, dy)
      if (direction !== null) setTab(adjacentIntraopTab(tab, direction))
    },
  }), [setTab, tab])

  useEffect(() => {
    const layout = tabLayouts.current[tab]
    if (layout) {
      const scrollX = centeredTabRailScrollX(layout, screenWidth)
      tabRailRef.current?.scrollTo({ x: scrollX, animated: true })
    }
  }, [screenWidth, tab, tabLayouts, tabRailRef])

  return {
    chartStart,
    currentCol,
    nowSlotPercent,
    eventRows,
    lastEventCol,
    chartRows,
    jumpVerticalTimetableToNow,
    tabSwipeResponder,
  }
}
