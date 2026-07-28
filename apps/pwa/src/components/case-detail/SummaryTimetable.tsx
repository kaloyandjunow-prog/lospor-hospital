import React, { useMemo } from "react"
import { View, Text, TouchableOpacity } from "react-native"
import Svg, { Line, Polyline, Polygon, Circle, Rect, Text as SvgText } from "react-native-svg"
import {
  buildSummaryTimetableModel,
  colToHHMM,
} from "@/lib/summary-timetable-model"
import { usePreferences } from "@/lib/preferences-context"
import { localizeSummaryTimetableModel } from "@/lib/clinical-display"

// Read-only timetable card for the case summary — the mobile twin of the
// printed record's intraop timetable (same projected keyEvents blob the web
// summary/print renders). Tap opens the live intraop cockpit. Follows the app
// theme: light theme shows the paper look, dark theme a matching dark chart
// (the printed record itself is always white).

const C_SBP_L = "#e03131", C_HR_L = "#2f9e44"
export const PALETTES = {
  light: {
    card: "#ffffff", ink: "#1e293b", muted: "#64748b", faint: "#94a3b8",
    grid: "#e2e8f0", gridMin: "#f1f5f9", timeBg: "#f1f5f9", timeTxt: "#334155",
    lbl: "#475569", sbp: C_SBP_L, hr: C_HR_L, event: "#4c6ef5", drug: "#7c3aed",
    title: "#1e3a8a",
  },
  dark: {
    card: "#1c1c1c", ink: "#e5e5e5", muted: "#909090", faint: "#7d7d7d",
    grid: "#3a3a3a", gridMin: "#262626", timeBg: "#262626", timeTxt: "#d0d0d0",
    lbl: "#b0b0b0", sbp: "#ff6b6b", hr: "#51cf66", event: "#748ffc", drug: "#9775fa",
    title: "#93c5fd",
  },
}

const VB_W = 1000
const LBL = 54

export function SummaryTimetable({ keyEvents, startISO, onPress, actionLabel }: {
  keyEvents: unknown
  startISO?: string | null
  onPress?: () => void
  /** Override the tap hint (default "Open intraop ›") — e.g. "View timetable ›" for finished cases. */
  actionLabel?: string
}) {
  const { theme, tc, language } = usePreferences()
  const P = theme === "dark" ? PALETTES.dark : PALETTES.light
  const model = useMemo(
    () => localizeSummaryTimetableModel(
      buildSummaryTimetableModel(keyEvents, language === "bg" ? "bg" : "en"),
      language,
    ),
    [keyEvents, language],
  )
  if (!model.hasData) return null

  const { nCols, vitals, events, drugTicks, lanes } = model

  // viewBox layout
  const graphH = 120, timeH = 20, laneH = 24, drugRowH = drugTicks.length ? 22 : 0
  const H = graphH + timeH + lanes.length * laneH + drugRowH + 6
  const cW = (VB_W - LBL) / nCols
  const xC = (c: number) => LBL + c * cW + cW / 2
  const xL = (c: number) => LBL + c * cW
  const yBP = (v: number) => graphH - 12 - (v / 220) * (graphH - 26)

  const els: React.ReactElement[] = []
  let k = 0
  const key = () => `el-${k++}`

  // graph background gridlines
  ;[40, 80, 120, 160, 200].forEach(y => {
    els.push(<Line key={key()} x1={LBL} y1={yBP(y)} x2={VB_W} y2={yBP(y)} stroke={y % 80 === 0 ? P.grid : P.gridMin} strokeWidth={y % 80 === 0 ? 0.8 : 0.5} />)
  })
  els.push(<Line key={key()} x1={LBL} y1={graphH} x2={VB_W} y2={graphH} stroke={P.grid} strokeWidth={1} />)

  // event flags
  events.forEach(e => {
    els.push(<Line key={key()} x1={xC(e.col)} y1={14} x2={xC(e.col)} y2={graphH} stroke={P.event} strokeWidth={1} strokeDasharray="4,3" opacity={0.6} />)
  })

  // vitals traces (SBP solid + markers, DBP dashed, HR)
  const pts = (get: (v: { systolic?: number; diastolic?: number; heartRate?: number }) => number | undefined) =>
    vitals.map((v, i) => ({ i, val: get(v ?? {}) })).filter(p => p.val != null)
      .map(p => `${xC(p.i)},${yBP(Number(p.val))}`).join(" ")
  const sbpPts = pts(v => v.systolic), dbpPts = pts(v => v.diastolic), hrPts = pts(v => v.heartRate)
  if (sbpPts.includes(" ")) els.push(<Polyline key={key()} points={sbpPts} fill="none" stroke={P.sbp} strokeWidth={1.8} />)
  if (dbpPts.includes(" ")) els.push(<Polyline key={key()} points={dbpPts} fill="none" stroke={P.sbp} strokeWidth={1.2} strokeDasharray="4,3" opacity={0.8} />)
  if (hrPts.includes(" "))  els.push(<Polyline key={key()} points={hrPts} fill="none" stroke={P.hr} strokeWidth={1.5} />)
  vitals.forEach((v, i) => {
    if (v?.systolic != null) { const x = xC(i), y = yBP(v.systolic)
      els.push(<Polygon key={key()} points={`${x - 3.4},${y - 2.8} ${x + 3.4},${y - 2.8} ${x},${y + 3.4}`} fill={P.sbp} />) }
    if (v?.heartRate != null) els.push(<Circle key={key()} cx={xC(i)} cy={yBP(v.heartRate)} r={2.2} fill={P.hr} />)
  })

  // time band
  els.push(<Rect key={key()} x={0} y={graphH} width={VB_W} height={timeH} fill={P.timeBg} />)
  const labelEvery = Math.max(1, Math.ceil(nCols / 8))
  for (let c = 0; c < nCols; c += labelEvery) {
    els.push(<SvgText key={key()} x={xC(c)} y={graphH + timeH - 5} fontSize={11} fontWeight="700" fill={P.timeTxt} textAnchor="middle">{colToHHMM(c, startISO)}</SvgText>)
  }

  // lanes
  lanes.forEach((lane, li) => {
    const y = graphH + timeH + li * laneH
    els.push(<SvgText key={key()} x={LBL - 6} y={y + laneH / 2 + 4} fontSize={10.5} fontWeight="700" fill={P.lbl} textAnchor="end">{lane.label}</SvgText>)
    lane.segments.forEach(seg => {
      const x1 = xL(seg.startCol), w = Math.max((seg.endCol - seg.startCol + 1) * cW, cW)
      els.push(<Rect key={key()} x={x1} y={y + 3} width={w} height={laneH - 6} rx={(laneH - 6) / 2} fill={lane.color} />)
      const fits = seg.text.length * 6.2 + 14 < w
      if (fits) els.push(<SvgText key={key()} x={x1 + 8} y={y + laneH / 2 + 4} fontSize={10.5} fontWeight="700" fill="#ffffff">{seg.text}</SvgText>)
    })
    els.push(<Line key={key()} x1={0} y1={y + laneH} x2={VB_W} y2={y + laneH} stroke={P.gridMin} strokeWidth={0.5} />)
  })

  // drug pin row — numbered like the printed record's drug administration log
  if (drugTicks.length) {
    const y = graphH + timeH + lanes.length * laneH
    els.push(<SvgText key={key()} x={LBL - 6} y={y + drugRowH / 2 + 4} fontSize={10.5} fontWeight="700" fill={P.lbl} textAnchor="end">Drugs</SvgText>)
    const lastX = [-Infinity, -Infinity]
    drugTicks.forEach(d => {
      const x = xC(d.col)
      const row = x >= lastX[0] + 16 ? 0 : 1
      lastX[row] = x
      const cy = y + (row === 0 ? drugRowH * 0.34 : drugRowH * 0.7)
      els.push(<Circle key={key()} cx={x} cy={cy} r={6.5} fill={P.card} stroke={P.drug} strokeWidth={1.4} />)
      els.push(<SvgText key={key()} x={x} y={cy + 3.2} fontSize={9} fontWeight="700" fill={P.drug} textAnchor="middle">{d.n}</SvgText>)
    })
  }

  // left divider
  els.push(<Line key={key()} x1={LBL} y1={0} x2={LBL} y2={H} stroke={P.grid} strokeWidth={0.8} />)

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} disabled={!onPress}>
      <View style={{
        backgroundColor: P.card, borderRadius: 14, borderWidth: 1, borderColor: P.grid,
        padding: 10, marginBottom: 12, overflow: "hidden",
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ color: P.title, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }}>{tc("summaryTtTitle")}</Text>
          {onPress && <Text style={{ color: P.muted, fontSize: 10 }}>{actionLabel ?? tc("summaryOpenIntraop")}</Text>}
        </View>
        <Svg width="100%" height={Math.round(H * 0.32)} viewBox={`0 0 ${VB_W} ${H}`} preserveAspectRatio="none">
          {els}
        </Svg>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
          <Text style={{ color: P.sbp, fontSize: 9.5 }}>▽ SBP · - - DBP</Text>
          <Text style={{ color: P.hr, fontSize: 9.5 }}>● HR</Text>
          {events.length > 0 && <Text style={{ color: P.event, fontSize: 9.5 }}>┆ {events.length} {tc("summaryEvents")}</Text>}
          {drugTicks.length > 0 && <Text style={{ color: P.drug, fontSize: 9.5 }}>| {drugTicks.length} {tc("summaryDrugs")}</Text>}
          <Text style={{ color: P.faint, fontSize: 9.5, marginLeft: "auto" }}>{tc("summaryAsPrinted")}</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}
