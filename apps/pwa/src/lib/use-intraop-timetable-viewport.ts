import { useEffect, useMemo, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react"
import { FlatList, PanResponder, ScrollView } from "react-native"

import type { TimetableData } from "@/components/IntraopTimetable"
import type { LogEvent } from "@/lib/intraop-log-event"
import {
  computeVerticalTimetableWindow,
  roundDown5Min,
  safeTimetableScrollIndex,
  timetableTabInitialScrollTarget,
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
  const { currentCol, nowSlotPercent, eventRows, lastEventCol, chartRows } =
    computeVerticalTimetableWindow(log, timetable, chartStart)

  function jumpVerticalTimetableToNow() {
    const safeIdx = safeTimetableScrollIndex(currentCol, chartRows.length)
    if (safeIdx >= 0) {
      verticalTimetableRef.current?.scrollToIndex({ index: safeIdx, animated: true, viewPosition: 0.35 })
    }
  }

  useEffect(() => {
    if (tab !== "log" || !startRef.current) return
    const scrollTarget = timetableTabInitialScrollTarget(lastEventCol, currentCol, chartRows.length)
    if (scrollTarget < 0) return
    const timer = setTimeout(() => {
      verticalTimetableRef.current?.scrollToIndex({ index: scrollTarget, animated: false, viewPosition: 0.35 })
    }, 80)
    return () => clearTimeout(timer)
  }, [chartRows.length, currentCol, lastEventCol, startRef, tab, verticalTimetableRef])

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
