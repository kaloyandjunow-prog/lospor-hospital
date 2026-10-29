import { sideSwipeExitMs, sideSwipeFade, sideSwipeFollow, sideSwipeGate, sideSwipeStep } from "./side-swipe"
import { useEffect, useMemo, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react"
import { Animated, Easing, FlatList, PanResponder, ScrollView } from "react-native"

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
  INTRAOP_TAB_KEYS,
  centeredTabRailScrollX,
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

  const tabSwipeGate = useRef(sideSwipeGate()).current
  // The tab's content follows the finger, leaves at its speed and the next
  // one glides in, as the preop sections do (10.0.0); it used to switch at once.
  const tabSlide = useRef(new Animated.Value(0)).current
  const tabFade = useRef(new Animated.Value(1)).current
  const tabMotion = useMemo(() => ({ slide: tabSlide, fade: tabFade }), [tabFade, tabSlide])
  const springBack = useRef(() => {
    Animated.parallel([
      Animated.spring(tabSlide, { toValue: 0, useNativeDriver: true, tension: 180, friction: 24 }),
      Animated.timing(tabFade, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start()
  }).current
  const tabSwipeResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // The same rule as the preop sections (side-swipe.ts).
    onStartShouldSetPanResponderCapture: () => tabSwipeGate.start(),
    onMoveShouldSetPanResponder: (_, { dx, dy }) => tabSwipeGate.claims(dx, dy),
    onPanResponderGrant: () => { tabSlide.stopAnimation(); tabFade.stopAnimation() },
    onPanResponderMove: (_, { dx }) => {
      // Nothing to slide towards past the first or the last tab.
      if (adjacentIntraopTab(tab, dx < 0 ? 1 : -1) === tab) return
      tabSlide.setValue(sideSwipeFollow(dx))
      tabFade.setValue(sideSwipeFade(dx, screenWidth))
    },
    onPanResponderRelease: (_, { dx, dy, vx }) => {
      const direction = sideSwipeStep(dx, dy, vx, screenWidth)
      const next = direction !== null ? adjacentIntraopTab(tab, direction) : tab
      if (next === tab) { springBack(); return }
      const toward = direction === 1 ? -1 : 1
      const exitMs = sideSwipeExitMs(toward * screenWidth - sideSwipeFollow(dx), vx)
      Animated.parallel([
        Animated.timing(tabSlide, { toValue: toward * screenWidth, duration: exitMs, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(tabFade, { toValue: 0, duration: exitMs, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
      ]).start(() => setTab(next))
    },
    onPanResponderTerminate: () => springBack(),
  }), [screenWidth, setTab, springBack, tab, tabFade, tabSlide, tabSwipeGate])

  // Whatever changed the tab (a swipe, a tap on the rail, a "Go to"), the new
  // one glides in from the side it lies on.
  const previousTab = useRef(tab)
  useEffect(() => {
    const before = INTRAOP_TAB_KEYS.indexOf(previousTab.current)
    const after = INTRAOP_TAB_KEYS.indexOf(tab)
    previousTab.current = tab
    if (before === after) return
    tabSlide.setValue((after > before ? 1 : -1) * screenWidth * 0.12)
    tabFade.setValue(0)
    Animated.parallel([
      Animated.timing(tabSlide, { toValue: 0, duration: 240, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(tabFade, { toValue: 1, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
    ]).start()
  }, [screenWidth, tab, tabFade, tabSlide])

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
    tabMotion,
  }
}
