import { useCallback, useMemo, useRef, useState } from "react"
import { ScrollView, type ScrollViewInstance, Text, TouchableOpacity, View, useWindowDimensions } from "react-native"
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router"
import { GestureHandlerRootView, GestureDetector, Gesture, ScrollView as GHScrollView } from "react-native-gesture-handler"
import { layoutRecordChart } from "@lospor/core/record-chart-layout"
import { recordLabels } from "@lospor/core/record-labels"
import { buildRecordTimetable } from "@lospor/core/record-timetable"
import { plannedProcedureLabel } from "@lospor/core/procedure-codes"
import { apiJson } from "@/lib/api"
import { usePreferences } from "@/lib/preferences-context"
import { AppHeader } from "@/components/AppHeader"
import { ScreenState } from "@/components/clinical-ui"
import { colors, withAlpha } from "@/theme/colors"
import { PALETTES } from "@/components/case-detail/record-palettes"
import { RecordChartSvg, RecordEpisodes, RecordEventLog, RecordVitalsTable } from "@/components/case-detail/RecordSummary"

// Read-only timetable viewer: the whole case on one chart, drawn from the same model as the case summary, the
// web and the print (buildRecordTimetable and layoutRecordChart in Core). No editing, no case lock, no cockpit
// code, so it is safe for closed cases and for a look mid-case.
//
// ZOOM: pinch (or - / +) changes the pixels per five-minute column; the chart widens and scrolls sideways.
// Every dose, bar and reading is always drawn; zoom never hides data. Under the chart: the episodes, the
// event log (deleted entries struck through) and the vitals every five minutes.

const MIN_COL_W = 4
const MAX_COL_W = 44
const LABEL_W = { en: 92, bg: 112 } as const
const clampColW = (value: number) => Math.min(MAX_COL_W, Math.max(MIN_COL_W, value))

type CaseData = {
  caseCode?: string | null
  status?: string
  intraop?: { keyEvents?: unknown; startedAt?: string | null; startTime?: string | null; timezone?: string | null } | null
  preop?: { plannedProcedure?: string | null; procedureUndetermined?: boolean } | null
  deletedEvents?: unknown
}

export default function TimetableViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { tc, language, theme } = usePreferences()
  const P = theme === "dark" ? PALETTES.dark : PALETTES.light
  const { width: screenWidth } = useWindowDimensions()
  const R = recordLabels(language)

  const [caseData, setCaseData] = useState<CaseData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setCaseData(await apiJson<CaseData>(`/api/cases/${id}?view=timetable&deleted=1`))
    } catch {
      setError(tc("caseLoadFailed"))
    }
  }, [id, tc])
  // Re-read whenever the screen is focused, not only on mount: reachable from the live cockpit, so a case can
  // gain vitals and drugs between two visits. No polling: this is opened, read and closed.
  useFocusEffect(useCallback(() => { void load() }, [load]))

  const kev = caseData?.intraop?.keyEvents
  const intraop = caseData?.intraop
  const clock = useMemo(
    () => ({ startedAt: intraop?.startedAt, startISO: intraop?.startTime, timezone: intraop?.timezone }),
    [intraop?.startedAt, intraop?.startTime, intraop?.timezone],
  )
  const model = useMemo(() => buildRecordTimetable(kev, clock, language), [kev, clock, language])
  const hasData = model.vitals.length > 0 || model.lanes.length > 0
  const labelWidth = LABEL_W[language === "bg" ? "bg" : "en"]
  const span = model.lastCol - model.firstCol + 1

  // Opens fitted to the screen, so a short case is whole at a glance and a long one starts readable.
  const fitColW = clampColW((screenWidth - 48 - labelWidth) / span)
  const [colW, setColW] = useState<number | null>(null)
  const effColW = colW ?? fitColW

  const scrollRef = useRef<ScrollViewInstance | null>(null)
  const offset = useRef(0)
  const applyZoom = useCallback((next: number) => {
    const from = colW ?? fitColW
    const to = clampColW(next)
    if (to === from) return
    setColW(to)
    // Keep the view where it was: scale the scroll offset with the column width.
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ x: Math.max(0, offset.current * (to / from)), animated: false }))
  }, [colW, fitColW])

  const pinchBase = useRef(fitColW)
  const pinch = Gesture.Pinch()
    .onStart(() => { pinchBase.current = effColW })
    .onEnd(e => { applyZoom(pinchBase.current * e.scale) })
    .runOnJS(true)

  const scene = useMemo(
    () => layoutRecordChart(model, { width: labelWidth + span * effColW, labelWidth, fontSize: 10, graphHeight: 170, ink: P.lbl, faint: P.grid }),
    [model, labelWidth, span, effColW, P.lbl, P.grid],
  )

  const zoomBtn = (label: string, onPress: () => void, disabled: boolean) => (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={{
      width: 34, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center",
      borderWidth: 1, borderColor: withAlpha(colors.primary, "55"),
      backgroundColor: withAlpha(colors.primary, disabled ? "08" : "16"),
      opacity: disabled ? 0.4 : 1,
    }}>
      <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "800" }}>{label}</Text>
    </TouchableOpacity>
  )

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* An explicit way out. Reached mid-case from the cockpit, the only exit was the system back gesture.
          router.back() rather than a push, so returning does not stack another cockpit. */}
      <AppHeader
        eyebrow="LOSPOR"
        title={tc("viewerTitle")}
        showNewCase={false}
        onBack={() => { if (router.canGoBack()) router.back(); else router.replace(`/(app)/cases/${id}`) }}
      />

      {error ? (
        <ScreenState title={error} />
      ) : !caseData ? (
        <ScreenState title={tc("viewerTitle")} loading />
      ) : !hasData ? (
        <ScreenState title={tc("viewerTitle")} message={tc("viewerNoData")} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }} numberOfLines={1}>
              {caseData.caseCode ?? ""}{plannedProcedureLabel(caseData.preop, language) ? ` · ${plannedProcedureLabel(caseData.preop, language)}` : ""}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {zoomBtn("−", () => applyZoom(effColW / 1.5), effColW <= MIN_COL_W)}
              {zoomBtn("+", () => applyZoom(effColW * 1.5), effColW >= MAX_COL_W)}
            </View>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 10.5, marginBottom: 8 }}>{tc("viewerZoomHint")}</Text>

          <GestureDetector gesture={pinch}>
            <View testID="record-viewer-chart" style={{ backgroundColor: P.card, borderRadius: 14, borderWidth: 1, borderColor: P.grid, marginBottom: 12, overflow: "hidden" }}>
              <Text style={{ color: P.title, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, paddingHorizontal: 10, paddingTop: 8 }}>{R.timetable.toUpperCase()}</Text>
              <GHScrollView
                horizontal showsHorizontalScrollIndicator contentContainerStyle={{ padding: 6 }}
                ref={(r: ScrollViewInstance | null) => { scrollRef.current = r }}
                onScroll={e => { offset.current = e.nativeEvent.contentOffset.x }}
                scrollEventThrottle={32}
              >
                <RecordChartSvg scene={scene} />
              </GHScrollView>
            </View>
          </GestureDetector>

          <RecordEpisodes keyEvents={kev} timeZone={intraop?.timezone} />
          <RecordEventLog keyEvents={kev} deletedEvents={caseData.deletedEvents} timeZone={intraop?.timezone} />
          <RecordVitalsTable keyEvents={kev} clock={clock} defaultOpen />
        </ScrollView>
      )}
    </View>
    </GestureHandlerRootView>
  )
}
