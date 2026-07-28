import React from "react"
import Svg, { Line, Polyline, Polygon, Circle, Rect, Text as SvgText } from "react-native-svg"
import type { SummaryTimetableModel, DrugLogEntry, ProjectedVital } from "@/lib/summary-timetable-model"
import { colToHHMM } from "@/lib/summary-timetable-model"
import { PALETTES } from "@/components/case-detail/SummaryTimetable"

// One read-only chart panel for the finished-case timetable viewer — a
// larger, richer sibling of the SummaryTimetable card: same projected data,
// panel time window (like the printed record's stacked panels), full event
// labels, numbered drug pins, a bucket-filled numeric vitals grid and lanes.
// Drawn wider than the screen and placed inside a horizontal ScrollView.

const LBL = 64
const EV_H = 34, GRAPH_H = 170, PIN_H = 30, TIME_H = 24, ROW_H = 20, LANE_H = 24

export function panelSvgWidth(nCols: number, colW: number): number {
  return LBL + nCols * colW
}

// Vitals row labels, matching the printed record. SpO₂/EtCO₂ are written the
// same way in Bulgarian clinical practice, so only BP/HR/Temp differ.
const VITAL_LABELS = {
  en: { bp: "BP", hr: "HR", spo2: "SpO₂", etco2: "EtCO₂", temp: "Temp",
        sbp: "SBP", dbp: "DBP", units: "mmHg/bpm", drugs: "Drugs" },
  bg: { bp: "АН", hr: "СЧ", spo2: "SpO₂", etco2: "EtCO₂", temp: "Темп",
        sbp: "САН", dbp: "ДАН", units: "mmHg/удм", drugs: "Лекарства" },
} as const

export function TimetablePanelSvg({ model, drugLog, startISO, c0, c1, step, colW, theme, lang = "en" }: {
  model: SummaryTimetableModel
  drugLog: DrugLogEntry[]
  startISO?: string | null
  c0: number
  c1: number
  /** Numeric-grid sampling step in 5-min columns (derived from zoom). */
  step: number
  /** Zoom: pixels per 5-min column. */
  colW: number
  theme: "light" | "dark"
  lang?: "en" | "bg"
}) {
  const VL = VITAL_LABELS[lang] ?? VITAL_LABELS.en
  const P = theme === "dark" ? PALETTES.dark : PALETTES.light
  const { vitals, events, lanes } = model

  const nCols = c1 - c0 + 1
  const COL_W = colW
  const W = panelSvgWidth(nCols, colW)
  const inRange = (c: number) => c >= c0 && c <= c1
  const xC = (c: number) => LBL + (c - c0) * COL_W + COL_W / 2
  const xL = (c: number) => LBL + (c - c0) * COL_W

  // Numeric grid rows present in this window
  const gridDefs: { k: string; f: (v: ProjectedVital) => string }[] = [
    { k: VL.bp,    f: (v: ProjectedVital) => (v.systolic != null && v.diastolic != null) ? `${v.systolic}/${v.diastolic}` : (v.systolic != null ? `${v.systolic}` : "") },
    { k: VL.hr,    f: (v: ProjectedVital) => v.heartRate != null ? `${v.heartRate}` : "" },
    { k: VL.spo2,  f: (v: ProjectedVital) => v.spO2 != null ? `${v.spO2}` : "" },
    { k: VL.etco2, f: (v: ProjectedVital) => v.etco2 != null ? `${v.etco2}` : "" },
    { k: VL.temp,  f: (v: ProjectedVital) => v.temp != null ? Number(v.temp).toFixed(1) : "" },
  ].filter(row => vitals.some((v, i) => inRange(i) && row.f(v ?? {}) !== ""))

  const visibleLanes = lanes
    .map(lane => ({
      ...lane,
      segments: lane.segments.filter(s => s.startCol <= c1 && s.endCol >= c0)
        .map(s => ({ ...s, startCol: Math.max(s.startCol, c0), endCol: Math.min(s.endCol, c1) })),
    }))
    .filter(lane => lane.segments.length > 0)

  const gTop = EV_H, gBot = EV_H + GRAPH_H
  const pinY = gBot, timeY = pinY + PIN_H, gridY0 = timeY + TIME_H
  const laneY0 = gridY0 + gridDefs.length * ROW_H
  const H = laneY0 + visibleLanes.length * LANE_H + 4
  const yBP = (v: number) => gBot - 6 - (v / 220) * (GRAPH_H - 16)

  const els: React.ReactElement[] = []
  let k = 0
  const key = () => `p-${k++}`

  // background bands
  els.push(<Rect key={key()} x={0} y={0} width={W} height={H} fill={P.card} />)
  els.push(<Rect key={key()} x={0} y={gTop} width={LBL} height={GRAPH_H} fill={theme === "dark" ? "#181818" : "#f8fafc"} />)

  // graph gridlines
  ;[40, 80, 120, 160, 200].forEach(y => {
    els.push(<Line key={key()} x1={LBL} y1={yBP(y)} x2={W} y2={yBP(y)} stroke={y % 80 === 0 ? P.grid : P.gridMin} strokeWidth={y % 80 === 0 ? 0.8 : 0.5} />)
  })
  for (let c = c0; c <= c1 + 1; c += step) {
    els.push(<Line key={key()} x1={xL(c)} y1={gTop} x2={xL(c)} y2={gBot} stroke={P.gridMin} strokeWidth={0.5} />)
  }
  els.push(<Line key={key()} x1={LBL} y1={gBot} x2={W} y2={gBot} stroke={P.grid} strokeWidth={1} />)

  // graph legend
  els.push(<SvgText key={key()} x={8} y={gTop + GRAPH_H / 2 - 12} fontSize={10} fill={P.sbp}>▽ {VL.sbp}</SvgText>)
  els.push(<SvgText key={key()} x={8} y={gTop + GRAPH_H / 2 + 2} fontSize={10} fill={P.sbp}>△ {VL.dbp}</SvgText>)
  els.push(<SvgText key={key()} x={8} y={gTop + GRAPH_H / 2 + 16} fontSize={10} fill={P.hr}>● {VL.hr}</SvgText>)
  els.push(<SvgText key={key()} x={8} y={gTop + GRAPH_H / 2 + 30} fontSize={9} fill={P.faint}>{VL.units}</SvgText>)

  // event flags with labels (2-row stagger)
  const lastEnd = [-Infinity, -Infinity]
  events.filter(e => inRange(e.col)).forEach(e => {
    const x = xC(e.col)
    const w = e.label.length * 6.2
    const nearRight = x + w > W - 8
    const x0 = nearRight ? x - w - 4 : x + 4
    const row = x0 >= lastEnd[0] + 8 ? 0 : 1
    lastEnd[row] = x0 + w
    const yl = row === 0 ? 12 : 26
    els.push(<Line key={key()} x1={x} y1={yl + 4} x2={x} y2={gBot} stroke={P.event} strokeWidth={1} strokeDasharray="5,4" opacity={0.6} />)
    els.push(<SvgText key={key()} x={nearRight ? x - 4 : x + 4} y={yl} fontSize={11} fontWeight="600" fill={P.event} textAnchor={nearRight ? "end" : "start"}>{e.label}</SvgText>)
  })

  // traces — full resolution, connected across unrecorded columns
  const pts = (get: (v: ProjectedVital) => number | undefined) =>
    vitals.map((v, i) => ({ i, val: get(v ?? {}) }))
      .filter(p => inRange(p.i) && p.val != null)
      .map(p => `${xC(p.i)},${yBP(Number(p.val))}`).join(" ")
  const sbpPts = pts(v => v.systolic), dbpPts = pts(v => v.diastolic), hrPts = pts(v => v.heartRate)
  if (sbpPts.includes(" ")) els.push(<Polyline key={key()} points={sbpPts} fill="none" stroke={P.sbp} strokeWidth={2} />)
  if (dbpPts.includes(" ")) els.push(<Polyline key={key()} points={dbpPts} fill="none" stroke={P.sbp} strokeWidth={1.3} strokeDasharray="5,4" opacity={0.8} />)
  if (hrPts.includes(" "))  els.push(<Polyline key={key()} points={hrPts} fill="none" stroke={P.hr} strokeWidth={1.7} />)
  vitals.forEach((v, i) => {
    if (!inRange(i)) return
    if (v?.systolic != null) { const x = xC(i), y = yBP(v.systolic)
      els.push(<Polygon key={key()} points={`${x - 4},${y - 3.3} ${x + 4},${y - 3.3} ${x},${y + 4}`} fill={P.sbp} />) }
    if (v?.diastolic != null) { const x = xC(i), y = yBP(v.diastolic)
      els.push(<Polygon key={key()} points={`${x - 4},${y + 3.3} ${x + 4},${y + 3.3} ${x},${y - 4}`} fill={P.card} stroke={P.sbp} strokeWidth={1.1} />) }
    if (v?.heartRate != null) els.push(<Circle key={key()} cx={xC(i)} cy={yBP(v.heartRate)} r={2.6} fill={P.hr} />)
  })

  // numbered drug pins (same numbering as the drug log below the chart)
  els.push(<Rect key={key()} x={0} y={pinY} width={W} height={PIN_H} fill={theme === "dark" ? "#1a1c1e" : "#fbfcfe"} />)
  els.push(<SvgText key={key()} x={LBL - 8} y={pinY + PIN_H / 2 + 4} fontSize={11} fontWeight="700" fill={P.lbl} textAnchor="end">{VL.drugs}</SvgText>)
  {
    const lastX = [-Infinity, -Infinity]
    drugLog.filter(d => inRange(d.col)).forEach(d => {
      const x = xC(d.col)
      const row = x >= lastX[0] + 20 ? 0 : 1
      lastX[row] = x
      const cy = pinY + (row === 0 ? PIN_H * 0.34 : PIN_H * 0.72)
      els.push(<Line key={key()} x1={x} y1={gBot - 5} x2={x} y2={cy} stroke={P.drug} strokeWidth={1.2} />)
      els.push(<Circle key={key()} cx={x} cy={cy} r={8} fill={P.card} stroke={P.drug} strokeWidth={1.6} />)
      els.push(<SvgText key={key()} x={x} y={cy + 3.8} fontSize={10.5} fontWeight="700" fill={P.drug} textAnchor="middle">{d.n}</SvgText>)
    })
  }

  // time band — labels every 30 min (or the sampling step if coarser)
  els.push(<Rect key={key()} x={0} y={timeY} width={W} height={TIME_H} fill={P.timeBg} />)
  els.push(<SvgText key={key()} x={LBL - 8} y={timeY + TIME_H / 2 + 4} fontSize={11} fill={P.faint} textAnchor="end">Time</SvgText>)
  // Round-time label rhythm that adapts to zoom (never denser than the grid).
  const minLabelCols = Math.max(step, 66 / COL_W)
  const labelEvery = [1, 2, 3, 6, 12, 24].find(v => v >= minLabelCols) ?? 24
  for (let c = c0; c <= c1; c++) if ((c - c0) % labelEvery === 0) {
    els.push(<SvgText key={key()} x={xC(c)} y={timeY + TIME_H / 2 + 4.5} fontSize={12} fontWeight="700" fill={P.timeTxt} textAnchor="middle">{colToHHMM(c, startISO)}</SvgText>)
  }

  // numeric vitals grid — sampled ticks, bucket-filled [c, c+step)
  const bucketVal = (f: (v: ProjectedVital) => string, c: number) => {
    for (let j = c; j < Math.min(c + step, c1 + 1, vitals.length); j++) {
      const val = f(vitals[j] ?? {})
      if (val !== "") return val
    }
    return ""
  }
  gridDefs.forEach((row, ri) => {
    const y = gridY0 + ri * ROW_H
    els.push(<SvgText key={key()} x={LBL - 8} y={y + ROW_H / 2 + 4} fontSize={10.5} fontWeight="700" fill={P.lbl} textAnchor="end">{row.k}</SvgText>)
    for (let c = c0; c <= Math.min(c1, vitals.length - 1); c++) {
      if ((c - c0) % step !== 0) continue
      const val = bucketVal(row.f, c)
      if (val === "") continue
      els.push(<SvgText key={key()} x={xC(c)} y={y + ROW_H / 2 + 4} fontSize={11} fontWeight="600" fill={P.ink} textAnchor="middle">{val}</SvgText>)
    }
    els.push(<Line key={key()} x1={0} y1={y + ROW_H} x2={W} y2={y + ROW_H} stroke={P.gridMin} strokeWidth={0.6} />)
  })

  // lanes
  visibleLanes.forEach((lane, li) => {
    const y = laneY0 + li * LANE_H
    els.push(<SvgText key={key()} x={LBL - 8} y={y + LANE_H / 2 + 4} fontSize={10.5} fontWeight="700" fill={P.lbl} textAnchor="end">{lane.label}</SvgText>)
    lane.segments.forEach(seg => {
      const x1 = xL(seg.startCol), w = Math.max((seg.endCol - seg.startCol + 1) * COL_W, COL_W)
      els.push(<Rect key={key()} x={x1} y={y + 3} width={w} height={LANE_H - 6} rx={(LANE_H - 6) / 2} fill={lane.color} />)
      const fits = seg.text.length * 6.4 + 16 < w
      if (fits) els.push(<SvgText key={key()} x={x1 + 9} y={y + LANE_H / 2 + 4} fontSize={11} fontWeight="700" fill="#ffffff">{seg.text}</SvgText>)
    })
    els.push(<Line key={key()} x1={0} y1={y + LANE_H} x2={W} y2={y + LANE_H} stroke={P.gridMin} strokeWidth={0.5} />)
  })

  // left divider
  els.push(<Line key={key()} x1={LBL} y1={0} x2={LBL} y2={H} stroke={P.grid} strokeWidth={0.8} />)

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {els}
    </Svg>
  )
}
