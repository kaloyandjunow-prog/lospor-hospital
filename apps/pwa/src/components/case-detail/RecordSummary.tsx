import React, { useMemo, useState } from "react"
import { ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from "react-native"
import Svg, { Line, Path, Rect, Text as SvgText } from "react-native-svg"
import { SIDE_SCROLL_STYLE } from "@/lib/gesture-style"
import { buildRecordEpisodes, buildRecordEventLog } from "@lospor/core/record-log"
import { recordLabels } from "@lospor/core/record-labels"
import { layoutRecordChart, type ChartScene, type SceneItem } from "@lospor/core/record-chart-layout"
import { buildRecordTimetable, type RecordClock } from "@lospor/core/record-timetable"
import { usePreferences } from "@/lib/preferences-context"
import { PALETTES } from "@/components/case-detail/record-palettes"

/**
 * The case summary on the phone and in the PWA (mock E): the same record the web and the print show, from the
 * same Core models. A timetable card (vitals graph and a lane for every drug, infusion, agent and fluid), the
 * event log with deleted entries struck through, the vitals behind a button, and the episodes.
 */
type Clock = RecordClock
const useRecordModel = (keyEvents: unknown, clock: Clock) => {
  const { language } = usePreferences()
  return useMemo(() => buildRecordTimetable(keyEvents, clock, language), [keyEvents, clock, language])
}
const logOf = (keyEvents: unknown) => (keyEvents && typeof keyEvents === "object" ? (keyEvents as { log?: unknown }).log : null)

function SceneNode({ item }: { item: SceneItem }) {
  switch (item.t) {
    case "rect":
      return <Rect x={item.x} y={item.y} width={item.w} height={item.h} rx={item.rx} fill={item.fill} opacity={item.opacity} />
    case "line":
      return <Line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke={item.stroke} strokeWidth={item.width} strokeDasharray={item.dash} opacity={item.opacity} />
    case "path":
      return <Path d={item.d} fill={item.fill ?? "none"} stroke={item.stroke} strokeWidth={item.width} strokeDasharray={item.dash} opacity={item.opacity} />
    case "text":
      return <SvgText x={item.x} y={item.y} textAnchor={item.anchor} fill={item.fill} fontSize={item.size} fontWeight={item.weight ? String(item.weight) : undefined} opacity={item.opacity}>{item.text}</SvgText>
  }
}

/** The chart's drawing instructions as react-native-svg, shared by the summary card and the timetable viewer. */
export function RecordChartSvg({ scene }: { scene: ChartScene }) {
  return (
    <Svg width={scene.width} height={scene.height} viewBox={`0 0 ${scene.width} ${scene.height}`}>
      {scene.items.map((item, index) => <SceneNode key={index} item={item} />)}
    </Svg>
  )
}

/** The whole case on one chart. It scrolls sideways when the case is longer than the screen is wide. */
export function RecordTimetableCard({ keyEvents, clock, onPress, actionLabel }: { keyEvents: unknown; clock: Clock; onPress?: () => void; actionLabel?: string }) {
  const { theme, language } = usePreferences()
  const P = theme === "dark" ? PALETTES.dark : PALETTES.light
  const { width: screenWidth } = useWindowDimensions()
  const model = useRecordModel(keyEvents, clock)
  const R = recordLabels(language)
  const labelWidth = language === "bg" ? 112 : 92
  const width = Math.max(screenWidth - 48, labelWidth + (model.lastCol + 1) * 7)
  const scene = useMemo(() => layoutRecordChart(model, { width, labelWidth, fontSize: 10, graphHeight: 150, ink: P.lbl, faint: P.grid }), [model, width, labelWidth, P.lbl, P.grid])
  if (model.vitals.length === 0 && model.lanes.length === 0) return null
  return (
    <TouchableOpacity testID="record-timetable-card" activeOpacity={onPress ? 0.8 : 1} onPress={onPress}
      style={{ backgroundColor: P.card, borderRadius: 14, borderWidth: 1, borderColor: P.grid, padding: 10, marginBottom: 12 }}>
      <Text style={{ color: P.title, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 6 }}>{R.timetable.toUpperCase()}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={SIDE_SCROLL_STYLE}>
        <RecordChartSvg scene={scene} />
      </ScrollView>
      {onPress && actionLabel ? <Text style={{ color: P.title, fontSize: 12, fontWeight: "700", marginTop: 6, textAlign: "right" }}>{actionLabel}</Text> : null}
    </TouchableOpacity>
  )
}

/** Every charted entry in the order it happened; a deleted one stays, struck through, with the minute it was deleted. */
export function RecordEventLog({ keyEvents, deletedEvents, timeZone }: { keyEvents: unknown; deletedEvents?: unknown; timeZone?: string | null }) {
  const { theme, language } = usePreferences()
  const P = theme === "dark" ? PALETTES.dark : PALETTES.light
  const R = recordLabels(language)
  const log = logOf(keyEvents)
  const deleted = Array.isArray(deletedEvents) ? deletedEvents : null
  const rows = useMemo(() => buildRecordEventLog(Array.isArray(log) ? log : [], deleted, timeZone, language), [log, deleted, timeZone, language])
  if (rows.length === 0) return null
  return (
    <View testID="record-event-log" style={{ backgroundColor: P.card, borderRadius: 14, borderWidth: 1, borderColor: P.grid, padding: 10, marginBottom: 12 }}>
      <Text style={{ color: P.title, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 6 }}>{R.eventLog.toUpperCase()}</Text>
      {rows.map(row => {
        const gone = row.deletedTime != null || row.id.startsWith("deleted:")
        const colour = gone ? P.faint : row.complication ? P.sbp : P.ink
        const strike = gone ? ({ textDecorationLine: "line-through" } as const) : null
        return (
          <View key={row.id} testID={gone ? "record-log-deleted" : "record-log-row"} style={{ flexDirection: "row", gap: 8, paddingVertical: 3, alignItems: "flex-start" }}>
            <Text style={[{ color: colour, fontSize: 12, minWidth: 44, fontVariant: ["tabular-nums"] }, strike]}>{row.time}</Text>
            <Text style={[{ color: gone ? P.faint : P.muted, fontSize: 11, minWidth: 64 }, strike]}>{R.kinds[row.kind]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[{ color: colour, fontSize: 12, fontWeight: row.complication ? "700" : "500" }, strike]}>{row.text}</Text>
              {gone ? <Text style={{ color: P.muted, fontSize: 10, fontWeight: "700" }}>{R.deletedAt}{row.deletedTime ? ` ${row.deletedTime}` : ""}</Text> : row.card ? <Text style={{ color: P.muted, fontSize: 10 }}>★ {row.card}</Text> : null}
            </View>
          </View>
        )
      })}
    </View>
  )
}

/** The vitals every five minutes, shut until asked for: on a phone a hundred rows is a screen of scrolling. */
export function RecordVitalsTable({ keyEvents, clock, defaultOpen = false }: { keyEvents: unknown; clock: Clock; defaultOpen?: boolean }) {
  const { theme, language } = usePreferences()
  const P = theme === "dark" ? PALETTES.dark : PALETTES.light
  const R = recordLabels(language)
  const model = useRecordModel(keyEvents, clock)
  const [open, setOpen] = useState(defaultOpen)
  if (model.vitals.length === 0) return null
  const cell = (text: string | number | undefined, width: number, bad = false) => (
    <Text style={{ color: bad ? P.sbp : P.ink, fontSize: 11, width, fontVariant: ["tabular-nums"], fontWeight: bad ? "700" : "400" }}>{text ?? "—"}</Text>
  )
  return (
    <View testID="record-vitals" style={{ backgroundColor: P.card, borderRadius: 14, borderWidth: 1, borderColor: P.grid, padding: 10, marginBottom: 12 }}>
      <TouchableOpacity testID="record-vitals-toggle" accessibilityRole="button" onPress={() => setOpen(value => !value)}>
        <Text style={{ color: P.title, fontSize: 12, fontWeight: "800" }}>{open ? "▾" : "▸"} {R.viewTable} · {model.vitals.length} {R.readings}</Text>
      </TouchableOpacity>
      {open ? (
        <View style={{ marginTop: 8 }}>
          <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: P.grid, paddingBottom: 3 }}>
            {[R.time, language === "bg" ? "АН" : "BP", language === "bg" ? "Пулс" : "HR", "SpO₂", "EtCO₂", "T °C"].map((h, i) => <Text key={i} style={{ color: P.muted, fontSize: 10, width: i === 1 ? 62 : 46, fontWeight: "700" }}>{h}</Text>)}
          </View>
          {model.vitals.map(v => {
            const low = typeof v.systolic === "number" && v.systolic < 90
            return (
              <View key={v.col} style={{ flexDirection: "row", paddingVertical: 2 }}>
                {cell(model.time(v.col), 46, low)}
                {cell(v.systolic != null && v.diastolic != null ? `${v.systolic}/${v.diastolic}` : undefined, 62, low)}
                {cell(v.heartRate, 46, low)}{cell(v.spO2, 46)}{cell(v.etco2, 46)}{cell(v.temp != null ? Math.round(v.temp * 10) / 10 : undefined, 46)}
              </View>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

/** Each complication with what was given while it lasted. */
export function RecordEpisodes({ keyEvents, timeZone }: { keyEvents: unknown; timeZone?: string | null }) {
  const { theme, language } = usePreferences()
  const P = theme === "dark" ? PALETTES.dark : PALETTES.light
  const R = recordLabels(language)
  const log = logOf(keyEvents)
  const episodes = useMemo(() => buildRecordEpisodes(Array.isArray(log) ? log : [], timeZone, language), [log, timeZone, language])
  if (episodes.length === 0) return null
  return (
    <View testID="record-episodes" style={{ backgroundColor: P.card, borderRadius: 14, borderWidth: 1, borderColor: P.grid, padding: 10, marginBottom: 12 }}>
      <Text style={{ color: P.title, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 6 }}>{R.episodes.toUpperCase()}</Text>
      {episodes.map(episode => (
        <View key={episode.id} style={{ borderLeftWidth: 3, borderLeftColor: P.sbp, paddingLeft: 8, marginBottom: 6 }}>
          <Text style={{ color: P.sbp, fontSize: 12, fontWeight: "700" }}>{episode.from}{episode.to ? `–${episode.to}` : ""} · {episode.label}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
            {episode.treated.map((t, i) => (
              <Text key={i} style={{ color: P.ink, fontSize: 11, borderWidth: 1, borderColor: P.grid, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 }}>{t.text} {t.time}</Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

type IntraopStart = { startedAt?: string | null; startTime?: string | null; timezone?: string | null; keyEvents?: unknown }

/** The four parts of the record in the order the case summary shows them. */
export function RecordSummary({ intraop, deletedEvents, onOpenTimetable, actionLabel }: { intraop?: IntraopStart | null; deletedEvents?: unknown; onOpenTimetable?: () => void; actionLabel?: string }) {
  const clock = useMemo<Clock>(
    () => ({ startedAt: intraop?.startedAt, startISO: intraop?.startTime, timezone: intraop?.timezone }),
    [intraop?.startedAt, intraop?.startTime, intraop?.timezone],
  )
  const keyEvents = intraop?.keyEvents
  return (
    <>
      <RecordTimetableCard keyEvents={keyEvents} clock={clock} onPress={onOpenTimetable} actionLabel={actionLabel} />
      <RecordEventLog keyEvents={keyEvents} deletedEvents={deletedEvents} timeZone={intraop?.timezone} />
      <RecordVitalsTable keyEvents={keyEvents} clock={clock} />
      <RecordEpisodes keyEvents={keyEvents} timeZone={intraop?.timezone} />
    </>
  )
}
