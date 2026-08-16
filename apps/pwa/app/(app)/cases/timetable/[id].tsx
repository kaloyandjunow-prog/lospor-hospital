import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ScrollView, Text, TouchableOpacity, View } from "react-native"
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router"
import { GestureHandlerRootView, GestureDetector, Gesture, ScrollView as GHScrollView } from "react-native-gesture-handler"
import { planPanels } from "@lospor/core/print"
import { INTRAOP_COLUMN_MINUTES } from "@lospor/core/intraop-engine"
import { apiJson } from "@/lib/api"
import { usePreferences } from "@/lib/preferences-context"
import { AppHeader } from "@/components/AppHeader"
import { ScreenState } from "@/components/clinical-ui"
import { colors, withAlpha } from "@/theme/colors"
import {
  buildSummaryTimetableModel, buildDrugLogEntries, colToHHMM,
  clampColW, stepForColW, MIN_COL_W, MAX_COL_W,
} from "@/lib/summary-timetable-model"
import { PALETTES } from "@/components/case-detail/SummaryTimetable"
import { TimetablePanelSvg } from "@/components/case-detail/TimetablePanelSvg"
import { displayClinicalCode, localizeSummaryTimetableModel } from "@/lib/clinical-display"

// Read-only timetable viewer for FINISHED cases — the in-app twin of the
// printed record's intraop page: stacked time panels (same planPanels split),
// numbered drug pins resolved in the administration log below. No editing, no
// case lock, no cockpit code — safe for closed cases.
//
// SEMANTIC ZOOM: pinch (or − / +) changes px-per-5-min-column; the numeric
// vitals table re-samples to stay legible (zoomed in → every 5 min, zoomed
// out → coarse q15/q30 like the print). Traces, pins, events and lanes always
// render every recorded point — zoom never hides data.

type CaseData = {
  caseCode?: string | null
  status?: string
  intraop?: { keyEvents?: unknown; startTime?: string | null } | null
  preop?: { plannedProcedure?: string | null } | null
}

export default function TimetableViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { tc, language, theme } = usePreferences()
  const P = theme === "dark" ? PALETTES.dark : PALETTES.light

  const [caseData, setCaseData] = useState<CaseData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setCaseData(await apiJson<CaseData>(`/api/cases/${id}`))
    } catch {
      setError(tc("caseLoadFailed"))
    }
  }, [id, tc])
  // Re-read whenever the screen is focused, not only on mount. Reachable from
  // the live cockpit now, so a case can gain vitals and drugs between two
  // visits; showing the state from the first visit would quietly misinform.
  // No polling: this is opened, read and closed.
  useFocusEffect(useCallback(() => { void load() }, [load]))

  const kev = caseData?.intraop?.keyEvents
  const startISO = caseData?.intraop?.startTime
  const model = useMemo(() => localizeSummaryTimetableModel(
    buildSummaryTimetableModel(kev, language === "bg" ? "bg" : "en"),
    language,
  ), [kev, language])
  const drugLog = useMemo(() => buildDrugLogEntries(kev, startISO).map(drug => ({
    ...drug,
    name: displayClinicalCode("option:INTRAOP_DRUG", drug.name, language, { label: drug.name }),
  })), [kev, language, startISO])
  const panels = useMemo(
    () => (model.hasData ? planPanels({ totalCols: model.nCols }) : []),
    [model],
  )

  // ── zoom state (shared by all panels) ──────────────────────────────────────
  const [colW, setColW] = useState<number | null>(null)
  useEffect(() => {
    if (panels.length && colW == null) setColW(panels.length > 1 ? 14 : 22)
  }, [panels, colW])
  const effColW = colW ?? 14
  const step = stepForColW(effColW)

  // Track each panel's horizontal offset so zooming keeps the view in place.
  const scrollRefs = useRef<Record<number, GHScrollView | null>>({})
  const offsets = useRef<Record<number, number>>({})
  const applyZoom = useCallback((next: number) => {
    setColW(prev => {
      const from = prev ?? 14
      const to = clampColW(next)
      if (to !== from) {
        const ratio = to / from
        requestAnimationFrame(() => {
          for (const [k, ref] of Object.entries(scrollRefs.current)) {
            const off = offsets.current[Number(k)] ?? 0
            ref?.scrollTo({ x: Math.max(0, off * ratio), animated: false })
          }
        })
      }
      return to
    })
  }, [])

  const pinchBase = useRef(14)
  const pinch = Gesture.Pinch()
    .onStart(() => { pinchBase.current = effColW })
    .onEnd(e => { applyZoom(pinchBase.current * e.scale) })
    .runOnJS(true)

  const contWord = language === "bg" ? "ПРОДЪЛЖЕНИЕ" : "CONTINUED"
  const sampledNote = (m: number) => language === "bg"
    ? `Жизнените показатели в таблицата са през ${m} мин · графиката, лекарствата и събитията са в точно записаното време`
    : `Vitals table sampled q${m}min · graph, drugs and events at exact recorded times`

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
      {/* An explicit way out. Reached mid-case from the cockpit, the only exit
          was the system back gesture — fine on Android, invisible to anyone
          holding the phone in one hand looking for a control. router.back()
          rather than a push, so returning does not stack another cockpit. */}
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
      ) : !model.hasData ? (
        <ScreenState title={tc("viewerTitle")} message={tc("viewerNoData")} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }} numberOfLines={1}>
              {caseData.caseCode ?? ""}{caseData.preop?.plannedProcedure ? ` · ${caseData.preop.plannedProcedure}` : ""}
            </Text>
            {/* zoom controls: − / current sampling badge / + */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {zoomBtn("−", () => applyZoom(effColW / 1.5), effColW <= MIN_COL_W)}
              <View style={{
                minWidth: 58, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center",
                paddingHorizontal: 8, backgroundColor: withAlpha(colors.primary, "0d"),
                borderWidth: 1, borderColor: withAlpha(colors.primary, "33"),
              }}>
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                  q{step * INTRAOP_COLUMN_MINUTES} min
                </Text>
              </View>
              {zoomBtn("+", () => applyZoom(effColW * 1.5), effColW >= MAX_COL_W)}
            </View>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 10.5, marginBottom: 8 }}>
            {tc("viewerZoomHint")}
          </Text>

          <GestureDetector gesture={pinch}>
            <View>
              {panels.map(pl => (
                <View key={pl.index} style={{
                  backgroundColor: P.card, borderRadius: 14, borderWidth: 1, borderColor: P.grid,
                  marginBottom: 12, overflow: "hidden",
                }}>
                  {panels.length > 1 && (
                    <Text style={{
                      color: P.muted, fontSize: 11, fontWeight: "700", paddingHorizontal: 10, paddingTop: 8,
                      fontVariant: ["tabular-nums"],
                    }}>
                      {pl.index > 0 ? `${contWord} · ` : ""}{colToHHMM(pl.startCol, startISO)} – {colToHHMM(pl.endCol + 1, startISO)}
                    </Text>
                  )}
                  <GHScrollView
                    horizontal showsHorizontalScrollIndicator contentContainerStyle={{ padding: 6 }}
                    ref={(r: GHScrollView | null) => { scrollRefs.current[pl.index] = r }}
                    onScroll={e => { offsets.current[pl.index] = e.nativeEvent.contentOffset.x }}
                    scrollEventThrottle={32}
                  >
                    <TimetablePanelSvg
                      model={model} drugLog={drugLog} startISO={startISO}
                      c0={pl.startCol} c1={pl.endCol}
                      step={step} colW={effColW}
                      theme={theme === "dark" ? "dark" : "light"}
                      lang={language === "bg" ? "bg" : "en"}
                    />
                  </GHScrollView>
                </View>
              ))}
            </View>
          </GestureDetector>
          {panels.length > 0 && (
            <Text style={{ color: colors.textMuted, fontSize: 10.5, marginBottom: 14 }}>
              {sampledNote(step * INTRAOP_COLUMN_MINUTES)}
            </Text>
          )}

          {/* Drug administration log — resolves the numbered pins */}
          {drugLog.length > 0 && (
            <View style={{
              backgroundColor: P.card, borderRadius: 14, borderWidth: 1, borderColor: P.grid, padding: 12,
            }}>
              <Text style={{ color: P.title, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 8 }}>
                {tc("viewerDrugLog")}
              </Text>
              {drugLog.map(d => (
                <View key={d.n} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 }}>
                  <View style={{
                    width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: P.drug,
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <Text style={{ color: P.drug, fontSize: 10, fontWeight: "700" }}>{d.n}</Text>
                  </View>
                  <Text style={{ color: P.muted, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{d.time}</Text>
                  <Text style={{ color: P.ink, fontSize: 13, flex: 1 }} numberOfLines={1}>{d.name}</Text>
                  <Text style={{ color: P.ink, fontSize: 13, fontWeight: "700" }}>{d.dose}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
    </GestureHandlerRootView>
  )
}
