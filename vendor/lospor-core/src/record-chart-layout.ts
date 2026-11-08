import type { RecordLane, RecordTimetable } from "./record-timetable"

/**
 * The record's timetable as drawing instructions (mock E): the vitals graph, a lane per drug with a diamond
 * and its amount for every dose, bars for infusions, agents, gas and fluids, and the episode bands. The web
 * draws the scene as SVG and the phone with react-native-svg, so the two cannot disagree about what is on the
 * chart or where a label goes.
 */
export type SceneItem =
  | { t: "rect"; x: number; y: number; w: number; h: number; fill: string; rx?: number; opacity?: number }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number; dash?: string; opacity?: number }
  | { t: "path"; d: string; stroke?: string; fill?: string; width?: number; dash?: string; opacity?: number }
  | { t: "text"; x: number; y: number; text: string; anchor: "start" | "middle" | "end"; fill: string; size?: number; weight?: number; opacity?: number }

export type ChartScene = { width: number; height: number; items: SceneItem[] }

export type ChartLayoutOptions = {
  width?: number
  /** Room for the lane names on the left. */
  labelWidth?: number
  fontSize?: number
  graphHeight?: number
  /** Minutes between the time marks; chosen from the length of the case when left out. */
  tickMinutes?: number
  /** Text and grid colours, so the chart reads on paper and on a dark phone. */
  ink?: string
  faint?: string
}

const COLUMN_MINUTES = 5
const MARGIN_RIGHT = 10
const TONE: Record<string, string> = { infusion: "#2563eb", agent: "#0d9488", gas: "#0284c7", fluid: "#0ea5e9", position: "#64748b" }
export const CHART_COLORS = { sbp: "#f87171", hr: "#4ade80", band: "rgba(220,38,38,.12)", flag: "#6366f1", flagText: "#4f46e5", dose: "#0369a1", card: "#d97706" } as const

export function pickTickMinutes(columns: number): number {
  const hours = (columns * COLUMN_MINUTES) / 60
  return hours <= 4 ? 30 : hours <= 10 ? 60 : 120
}

type Placed = { px: number; text: string; flip: boolean; track: number; card: boolean }
type BolusRow = { kind: "bolus"; lane: Extract<RecordLane, { kind: "bolus" }>; placed: Placed[]; h: number }
type BarsRow = { kind: "bars"; lane: Extract<RecordLane, { kind: "bars" }>; h: number }

/** Beside its diamond when there is room, else the track above or below it; dropped when none fits (the log still has it). */
function placeDoses(lane: Extract<RecordLane, { kind: "bolus" }>, x: (col: number) => number, left: number, width: number, fs: number): BolusRow {
  const cw = (txt: string) => txt.length * fs * 0.56 + 6
  const taken: Array<Array<[number, number]>> = [lane.doses.map(d => [x(d.col) - 5, x(d.col) + 5] as [number, number]), [], []]
  const placed: Placed[] = lane.doses.map(d => {
    const px = x(d.col)
    const text = d.label + (d.card ? " ★" : "")
    const wd = cw(text)
    const flip = px > left + (width - left) * 0.82
    const iv: [number, number] = flip ? [px - 8 - wd, px - 8] : [px + 8, px + 8 + wd]
    const free = (k: number) => !taken[k]!.some(([lo, hi]) => iv[0] < hi && iv[1] > lo)
    const track = [0, 1, 2].find(free) ?? -1
    if (track >= 0) taken[track]!.push(iv)
    return { px, text, flip, track, card: d.card }
  })
  return { kind: "bolus", lane, placed, h: placed.some(p => p.track !== 0) ? 34 : 20 }
}

export function layoutRecordChart(model: RecordTimetable, options: ChartLayoutOptions = {}): ChartScene {
  const width = options.width ?? 1040
  const left = options.labelWidth ?? 118
  const fs = options.fontSize ?? 9.5
  const graphHeight = options.graphHeight ?? 175
  const ink = options.ink ?? "#334155"
  const faint = options.faint ?? "#e2e8f0"
  const { firstCol, lastCol } = model
  const span = Math.max(1, lastCol - firstCol + 1)
  const x = (col: number) => left + ((Math.min(Math.max(col, firstCol), lastCol + 1) - firstCol) / span) * (width - left - MARGIN_RIGHT)
  const tickStep = Math.max(1, Math.round((options.tickMinutes ?? pickTickMinutes(span)) / COLUMN_MINUTES))
  const ticks: number[] = []
  for (let col = firstCol; col <= lastCol + 1; col += tickStep) ticks.push(col)

  // Event flags stand on up to four rows so neighbouring labels do not print over one another.
  const flagRows = Math.min(4, Math.max(1, model.flags.length))
  const top = model.flags.length ? 14 + flagRows * 11 : 10
  const bottom = 18
  const y = (v: number) => top + (1 - (v - 40) / 140) * (graphHeight - top - bottom)
  const trace = (key: "systolic" | "diastolic" | "heartRate") =>
    model.vitals.filter(v => typeof v[key] === "number").map((v, i) => `${i ? "L" : "M"}${x(v.col + 0.5).toFixed(1)} ${y(v[key] as number).toFixed(1)}`).join(" ")

  const rows: Array<BolusRow | BarsRow> = model.lanes.map(lane => lane.kind === "bolus"
    ? placeDoses(lane, c => x(c + 0.5), left, width, fs)
    : { kind: "bars", lane, h: 20 })
  const height = graphHeight + rows.reduce((sum, r) => sum + r.h, 0) + 18
  const items: SceneItem[] = []

  for (const e of model.episodes) items.push({ t: "rect", x: x(e.fromCol), y: top, w: Math.max(2, x(e.toCol + 1) - x(e.fromCol)), h: height - top - 16, fill: CHART_COLORS.band })
  for (const v of [60, 90, 120, 150]) {
    items.push({ t: "line", x1: left, x2: width - MARGIN_RIGHT, y1: y(v), y2: y(v), stroke: faint, width: 0.7 })
    items.push({ t: "text", x: left - 6, y: y(v) + 3, text: String(v), anchor: "end", fill: ink, size: fs, opacity: 0.6 })
  }
  for (const col of ticks) items.push({ t: "line", x1: x(col), x2: x(col), y1: top, y2: height - 16, stroke: faint, width: 0.7 })
  items.push({ t: "path", d: trace("diastolic"), stroke: CHART_COLORS.sbp, width: 1.1, dash: "3 3", opacity: 0.7 })
  items.push({ t: "path", d: trace("systolic"), stroke: CHART_COLORS.sbp, width: 1.7 })
  items.push({ t: "path", d: trace("heartRate"), stroke: CHART_COLORS.hr, width: 1.5 })
  model.flags.forEach((f, i) => {
    items.push({ t: "line", x1: x(f.col), x2: x(f.col), y1: top - 4, y2: graphHeight - bottom, stroke: CHART_COLORS.flag, width: 0.8, dash: "3 3", opacity: 0.7 })
    const flip = x(f.col) > left + (width - left) * 0.8
    items.push({ t: "text", x: x(f.col) + (flip ? -3 : 3), y: 12 + (i % flagRows) * 11, text: f.label, anchor: flip ? "end" : "start", fill: CHART_COLORS.flagText, size: fs })
  })

  let rowTop = graphHeight
  for (const row of rows) {
    const yc = rowTop + (row.kind === "bolus" && row.h > 20 ? 17 : 10)
    items.push({ t: "line", x1: left, x2: width - MARGIN_RIGHT, y1: rowTop + row.h, y2: rowTop + row.h, stroke: faint, width: 0.5 })
    items.push({ t: "text", x: left - 6, y: yc + 3.5, text: row.lane.name, anchor: "end", fill: ink, size: fs, weight: 600 })
    if (row.kind === "bolus") {
      for (const p of row.placed) {
        const colour = p.card ? CHART_COLORS.card : CHART_COLORS.dose
        const ty = p.track === 1 ? yc - 8 : p.track === 2 ? yc + 10 : yc + 3.5
        items.push({ t: "path", d: `M${p.px} ${yc - 5} l4.5 5 l-4.5 5 l-4.5 -5z`, fill: colour })
        if (p.track >= 0) items.push({ t: "text", x: p.flip ? p.px - 8 : p.px + 8, y: ty, text: p.text, anchor: p.flip ? "end" : "start", fill: colour, size: fs, weight: 700 })
      }
    } else {
      row.lane.bars.forEach((b, bi) => {
        const a = x(b.startCol), wd = x(b.endCol + 1) - a
        items.push({ t: "rect", x: a, y: yc - 6.5, w: Math.max(2, wd), h: 13, rx: 6.5, fill: TONE[row.lane.tone] ?? TONE.infusion!, opacity: bi % 2 ? 0.82 : 1 })
        if (wd > b.label.length * fs * 0.56 + 22) items.push({ t: "text", x: a + 7, y: yc + 3.4, text: b.label, anchor: "start", fill: "#fff", size: fs, weight: 600 })
      })
    }
    rowTop += row.h
  }
  for (const col of ticks) items.push({ t: "text", x: x(col), y: height - 4, text: model.time(col), anchor: "middle", fill: ink, size: fs, opacity: 0.65 })
  return { width, height, items }
}
