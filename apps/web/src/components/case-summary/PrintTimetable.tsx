"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  buildDrugLogEntries,
  calculateDrugTotals,
  naturalTimetableColumnCount,
} from "@lospor/core/intraop-summary"
import { colToHHMM as sharedColToHHMM } from "@lospor/core/summary-timetable"
import { clinicalDisplayLabel, formatClinicalGasMixLabel, resolveClinicalDisplay, type ClinicalLocale } from "@lospor/core/display"
import { calcInfusionTotals } from "@lospor/core/intraop-totals"
import type {
  LegacyKeyEvents, TimetableInfusion, VitalsEntry,
  AgentSegment, TimetableFluid, GasSettingsSegment, ClinicalEvent, PositionSegment,
  TimetableData,
} from "@/types/timetable"

function colToHHMM(col: number, startISO?: string | null) {
  return sharedColToHHMM(col, startISO)
}

// ── Drug/fluid totals ─────────────────────────────────────────────────────────
export function calcDrugTotals(timetable: LegacyKeyEvents) {
  return calculateDrugTotals({ drugs: timetable.drugs ?? [] })
}

export function calcInfTotals(timetable: LegacyKeyEvents) {
  const infs: TimetableInfusion[] = Array.isArray(timetable?.infusions) ? timetable.infusions : []
  return calcInfusionTotals(infs, null, null, {})
}

// ── Palettes — light "paper" (print + light theme) and dark (summary only;
// the print page strips the theme class so the record always prints white) ───
type Palette = {
  bg: string; side: string; pinBg: string; timeBg: string
  ink: string; faint: string; lbl: string; timeTxt: string; cap: string
  gridMaj: string; gridMin: string; sep: string
  event: string; sbp: string; hr: string; pos: string
}
const PAL_LIGHT: Palette = {
  bg: "#ffffff", side: "#f8fafc", pinBg: "#fbfcfe", timeBg: "#f1f5f9",
  ink: "#1e293b", faint: "#94a3b8", lbl: "#475569", timeTxt: "#334155", cap: "#64748b",
  gridMaj: "#e2e8f0", gridMin: "#f1f5f9", sep: "#e8edf3",
  event: "#4c6ef5", sbp: "#e03131", hr: "#2f9e44", pos: "#475569",
}
const PAL_DARK: Palette = {
  bg: "#1c1c1c", side: "#181818", pinBg: "#1a1c1e", timeBg: "#262626",
  ink: "#e5e5e5", faint: "#7d7d7d", lbl: "#b0b0b0", timeTxt: "#d0d0d0", cap: "#909090",
  gridMaj: "#3a3a3a", gridMin: "#262626", sep: "#2c2c2c",
  event: "#748ffc", sbp: "#ff6b6b", hr: "#51cf66", pos: "#64748b",
}

// Chart-internal labels (everything else on the sheet is translated in CaseSummary).
const CHART_STR = {
  en: {
    time: "Time", drugs: "Drugs", agent: "Agent", infusion: "Infusion", gas: "Gas", fluids: "Fluids", position: "Position",
    bp: "BP", hr: "HR", spo2: "SpO₂", etco2: "EtCO₂", temp: "Temp",
    sbp: "SBP", dbp: "DBP", units: "mmHg / bpm",
  },
  bg: {
    time: "Час",  drugs: "Лекарства", agent: "Агент", infusion: "Инфузия", gas: "Газова смес", fluids: "Флуиди", position: "Позиция",
    // Chart row labels stay abbreviated — the column is narrow. SpO₂/EtCO₂ are
    // written the same way in Bulgarian clinical practice.
    bp: "АН", hr: "СЧ", spo2: "SpO₂", etco2: "EtCO₂", temp: "Темп",
    sbp: "САН", dbp: "ДАН", units: "mmHg / удм",
  },
}
type ChartStr = typeof CHART_STR.en

// Drug colours matching the reference sheet; fallback palette for others.
const DRUG_COLOR_MAP: [RegExp, string][] = [
  [/midazolam|diazepam/i,        "#7c3aed"],
  [/propofol|thiopental|etomid/i,"#d6336c"],
  [/fentanyl|morphine|alfentanil|sufentanil|pethidine|opioid/i, "#2563eb"],
  [/rocuronium|vecuronium|atracurium|cisatracurium|succinyl|suxameth/i, "#e8590c"],
  [/ondansetron|metoclopramide|droperidol/i, "#2f9e44"],
  [/sugammadex|neostigmine|glycopyrrolate|atropine/i, "#d9480f"],
  [/paracetamol|metamizole|ketorolac|ibuprofen|diclofenac|dexketoprofen/i, "#0c8599"],
  [/ephedrine|phenylephrine|noradrenaline|adrenaline|dopamine/i, "#c2255c"],
  [/dexamethasone|methylprednisolone|hydrocortisone/i, "#5f3dc4"],
  [/ketamine|dexmedetomidine|clonidine/i, "#6741d9"],
]
const DRUG_FALLBACK = ["#1971c2", "#087f5b", "#9c36b5", "#e8590c", "#3b5bdb", "#c92a2a"]
export function drugColor(name: string, idx: number): string {
  for (const [re, c] of DRUG_COLOR_MAP) if (re.test(name)) return c
  return DRUG_FALLBACK[idx % DRUG_FALLBACK.length]
}

// Case-wide numbered drug log — the pins on the chart (① ② …) and the DRUG
// ADMINISTRATION LOG box render from this one list so numbering always agrees.
export type DrugLogEntry = {
  n: number
  time: string
  name: string
  dose: string
  color: string
  colIdx: number
}
export function buildDrugLog(timetable: LegacyKeyEvents, startISO?: string | null): DrugLogEntry[] {
  return buildDrugLogEntries({
    drugs: Array.isArray(timetable?.drugs) ? timetable.drugs : [],
  }, startISO, "utc")
    .map((entry, i) => ({
      n: i + 1,
      time: entry.time,
      name: entry.name,
      dose: `${entry.dose} ${entry.unit}`.trim(),
      color: drugColor(entry.name, i),
      colIdx: entry.column,
    }))
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function eventDisplayLabel(label: string, locale: ClinicalLocale): string {
  const option = resolveClinicalDisplay("option:INTRAOP_EVENT", label, locale)
  return option.known
    ? option.label
    : clinicalDisplayLabel("complication", label, locale, { label })
}

function gasText(g: GasSettingsSegment, locale: ClinicalLocale): string {

  const parts: string[] = [formatClinicalGasMixLabel(g, locale)]
  const fgfs = [g.fgf, ...(g.settingsChanges ?? []).map(c => c.fgf)].filter(v => v != null) as number[]
  parts.push(fgfs.length > 1 ? `FGF ${g.fgf}→${fgfs[fgfs.length - 1]} L/min` : `FGF ${g.fgf} L/min`)

  return parts.join(" · ")
}

const VB_W = 1100
const LBL  = 78

// A view window over the chart: inclusive column range + vitals sampling step
// (in columns — intervalMin/5) + optional corner caption ("CONTINUED · 14:00 –
// 20:00"). INVARIANT: `step` thins ONLY the vitals numeric-grid text — graph
// traces, drugs, fluids, events and positions always render at their true
// recorded columns, never thinned, never snapped.
export type TimetableView = { c0?: number; c1?: number; step?: number; caption?: string }

export function naturalMaxCols(t: LegacyKeyEvents): number {
  return naturalTimetableColumnCount(t as TimetableData, 12, 1)
}

// Build one chart panel as SVG markup in a fixed 1100-wide viewBox, styled to
// match the LOSPOR paper record: event flags above the graph, clean traces,
// numbered drug pins on a dedicated strip, a bucket-filled numeric vitals
// grid, and solid lane bars. Palette switches for the dark summary theme.
function buildSVG(
  t: LegacyKeyEvents,
  startISO: string | null | undefined,
  H: number,
  view: TimetableView = {},
  P: Palette = PAL_LIGHT,
  S: ChartStr = CHART_STR.en,
  locale: ClinicalLocale = "en",
): string {
  const vitals: VitalsEntry[]          = Array.isArray(t?.vitals)      ? t.vitals      : []
  const agentsAll: AgentSegment[]      = Array.isArray(t?.agents)      ? t.agents      : []
  const gasAll: GasSettingsSegment[]   = Array.isArray(t?.gasSettings) ? t.gasSettings : []
  const infusionsAll: TimetableInfusion[] = Array.isArray(t?.infusions) ? t.infusions  : []
  const fluidsAll: TimetableFluid[]    = Array.isArray(t?.fluids)      ? t.fluids      : []
  const eventsAll: ClinicalEvent[]     = (Array.isArray(t?.clinicalEvents) ? t.clinicalEvents : [])
    .slice().sort((a, b) => (a.colIdx ?? 0) - (b.colIdx ?? 0))
  const positionsAll: PositionSegment[] = Array.isArray(t?.positions)  ? t.positions   : []

  const natural = naturalMaxCols(t)
  const c0 = Math.max(0, view.c0 ?? 0)
  const c1 = Math.max(c0, view.c1 ?? natural - 1)
  const step = Math.max(1, view.step ?? 1)
  const nCols = c1 - c0 + 1
  const inRange = (c: number) => c >= c0 && c <= c1
  const sampled = (c: number) => (c - c0) % step === 0

  const cW = (VB_W - LBL) / nCols
  const xL = (c: number) => LBL + (c - c0) * cW
  const xC = (c: number) => LBL + (c - c0) * cW + cW / 2

  // Case-wide numbered drug log; pins render for doses inside this window.
  const drugLog = buildDrugLog(t, startISO)
  const pins = drugLog.filter(d => inRange(d.colIdx))
  const events = eventsAll.filter(e => inRange(e.colIdx ?? 0))
  const clip = <T extends { startCol?: number; endCol?: number }>(seg: T) => ({
    ...seg,
    startCol: Math.max(seg.startCol ?? 0, c0),
    endCol:   Math.min(seg.endCol ?? seg.startCol ?? 0, c1),
  })
  const overlaps = (seg: { startCol?: number; endCol?: number }) =>
    (seg.startCol ?? 0) <= c1 && (seg.endCol ?? seg.startCol ?? 0) >= c0
  const agents    = agentsAll.filter(overlaps).map(clip)
  const gas       = gasAll.filter(overlaps).map(clip)
  const infusions = infusionsAll.filter(overlaps).map(clip)
  const fluids    = fluidsAll.filter(overlaps).map(clip)
  const positions = positionsAll.filter(overlaps).map(clip)

  // Numeric grid rows (only those with any data in this window).
  const gridDefs: { k: string; f: (v: VitalsEntry) => string }[] = [
    { k: S.bp,    f: (v: VitalsEntry) => (v.systolic != null && v.diastolic != null) ? `${v.systolic}/${v.diastolic}` : (v.systolic != null ? `${v.systolic}` : "") },
    { k: S.hr,    f: (v: VitalsEntry) => v.heartRate != null ? `${v.heartRate}` : "" },
    { k: S.spo2,  f: (v: VitalsEntry) => v.spO2 != null ? `${v.spO2}` : "" },
    { k: S.etco2, f: (v: VitalsEntry) => v.etco2 != null ? `${v.etco2}` : "" },
    { k: S.temp,  f: (v: VitalsEntry) => v.temp != null ? v.temp.toFixed(1) : "" },
  ].filter(row => vitals.some((v, idx) => inRange(idx) && row.f(v ?? {}) !== ""))

  const gRows    = gridDefs.length
  const laneRows = agents.length + infusions.length + gas.length + fluids.length + (positions.length ? 1 : 0)

  // Vertical layout — MUST fit inside H (anything past it is clipped by the
  // viewBox). Text rows share a unit height derived from the available space;
  // the graph absorbs whatever remains, so a single-panel short case gets a
  // big roomy graph and a stacked half-case panel a compact one.
  const evH   = 18                      // event-label rows above the graph
  const pinH  = 14                      // numbered drug-pin strip
  const timeH = 14
  const fixed = evH + pinH + timeH
  const totalRows = Math.max(gRows + laneRows, 1)
  const MIN_GRAPH = 36
  // Exact fit: rows shrink before anything clips; the graph absorbs surplus.
  const unit  = Math.max(4.5, Math.min(14, (H - fixed - MIN_GRAPH) / totalRows))
  const rowH  = unit
  const laneH = unit
  const graphH = Math.max(MIN_GRAPH, H - fixed - unit * totalRows)

  const graphTop = evH, graphBot = evH + graphH
  const pinY   = graphBot
  const timeY  = pinY + pinH
  const gridY0 = timeY + timeH
  const laneY0 = gridY0 + gRows * rowH
  const yBP = (v: number) => graphBot - 5 - (v / 220) * (graphH - 12)

  const numFs  = Math.max(6.5, Math.min(9.5, rowH * 0.85))
  const lblFs  = Math.max(6.5, Math.min(9.5, rowH * 0.8))
  const laneFs = Math.max(6.5, Math.min(9.5, laneH * 0.8))

  let s = ""
  // Sheet background
  s += `<rect x="0" y="0" width="${VB_W}" height="${H}" fill="${P.bg}"/>`
  // Left label column background for the graph block
  s += `<rect x="0" y="${graphTop}" width="${LBL}" height="${graphH}" fill="${P.side}"/>`
  // Panel caption (time window) in the top-left corner, clear of the chart
  if (view.caption) {
    s += `<text x="4" y="11" font-size="8" font-weight="700" fill="${P.cap}" font-family="Consolas,monospace">${esc(view.caption)}</text>`
  }

  // ── graph gridlines ──
  ;[40, 80, 120, 160, 200].forEach(y => {
    s += `<line x1="${LBL}" y1="${yBP(y)}" x2="${VB_W}" y2="${yBP(y)}" stroke="${y % 80 === 0 ? P.gridMaj : P.gridMin}" stroke-width="${y % 80 === 0 ? 0.7 : 0.4}"/>`
  })
  for (let c = c0; c <= c1 + 1; c += step) s += `<line x1="${xL(c)}" y1="${graphTop}" x2="${xL(c)}" y2="${graphBot}" stroke="${P.gridMin}" stroke-width="0.35"/>`
  s += `<line x1="${LBL}" y1="${graphBot}" x2="${VB_W}" y2="${graphBot}" stroke="${P.gridMaj}" stroke-width="0.8"/>`

  // ── clinical event flags: dashed verticals + labels above the graph.
  // Labels that would collide with the previous one drop to a second row.
  const lastLabelEnd = [-Infinity, -Infinity]
  events.forEach(e => {
    const x = xC(e.colIdx ?? 0)
    const label = esc(eventDisplayLabel(String(e.label ?? ""), locale))
    const w = String(e.label ?? "").length * 5.2
    const nearRight = x + w > VB_W - 6
    const x0 = nearRight ? x - w - 3 : x + 3
    const row = x0 >= lastLabelEnd[0] + 6 ? 0 : 1
    lastLabelEnd[row] = x0 + w
    const yLbl = row === 0 ? 8 : 17
    s += `<line x1="${x}" y1="${yLbl + 4}" x2="${x}" y2="${graphBot}" stroke="${P.event}" stroke-width="0.9" stroke-dasharray="4,3" opacity="0.6"/>`
    s += `<text x="${nearRight ? x - 3 : x + 3}" y="${yLbl}" font-size="9.5" fill="${P.event}" font-weight="600" text-anchor="${nearRight ? "end" : "start"}">${label}</text>`
  })

  // ── graph legend (left column) ──
  {
    const ly = graphTop + graphH / 2 - 10
    s += `<text x="8" y="${ly}" font-size="8.5" fill="${P.sbp}">▽ ${S.sbp}  △ ${S.dbp}</text>`
    s += `<text x="8" y="${ly + 12}" font-size="8.5" fill="${P.hr}">● ${S.hr}</text>`
    s += `<text x="8" y="${ly + 24}" font-size="7.5" fill="${P.faint}">${S.units}</text>`
  }

  // ── vitals traces — FULL resolution (every recorded point plots; only the
  // numeric text rows sample) and connected across unrecorded columns. ──
  function segs(key: keyof VitalsEntry): string[][] {
    const cur: string[] = []
    vitals.forEach((v, idx) => {
      if (!inRange(idx)) return
      const val = v?.[key]
      if (val != null && !isNaN(Number(val))) cur.push(`${xC(idx)},${yBP(Number(val))}`)
    })
    return cur.length > 1 ? [cur] : []
  }
  segs("systolic").forEach(p => s += `<polyline points="${p.join(" ")}" fill="none" stroke="${P.sbp}" stroke-width="1.5"/>`)
  vitals.forEach((v, idx) => { if (inRange(idx) && v?.systolic != null) { const x = xC(idx), y = yBP(v.systolic)
    s += `<polygon points="${x - 3.2},${y - 2.6} ${x + 3.2},${y - 2.6} ${x},${y + 3.2}" fill="${P.sbp}"/>` } })
  segs("diastolic").forEach(p => s += `<polyline points="${p.join(" ")}" fill="none" stroke="${P.sbp}" stroke-width="1.1" stroke-dasharray="4,3" opacity="0.85"/>`)
  vitals.forEach((v, idx) => { if (inRange(idx) && v?.diastolic != null) { const x = xC(idx), y = yBP(v.diastolic)
    s += `<polygon points="${x - 3.2},${y + 2.6} ${x + 3.2},${y + 2.6} ${x},${y - 3.2}" fill="${P.bg}" stroke="${P.sbp}" stroke-width="1"/>` } })
  segs("heartRate").forEach(p => s += `<polyline points="${p.join(" ")}" fill="none" stroke="${P.hr}" stroke-width="1.3"/>`)
  vitals.forEach((v, idx) => { if (inRange(idx) && v?.heartRate != null) s += `<circle cx="${xC(idx)}" cy="${yBP(v.heartRate)}" r="2.1" fill="${P.hr}"/>` })

  // ── numbered drug pins on their own strip (① ② … at the exact time; the
  // DRUG ADMINISTRATION LOG box lists dose + time per number). Colliding pins
  // nudge to a second mini-row. ──
  s += `<rect x="0" y="${pinY}" width="${VB_W}" height="${pinH}" fill="${P.pinBg}"/>`
  s += `<text x="${LBL - 8}" y="${pinY + pinH / 2 + 3}" font-size="8.5" font-weight="700" fill="${P.lbl}" text-anchor="end">${S.drugs}</text>`
  {
    const lastX = [-Infinity, -Infinity]
    const r = Math.min(6, pinH * 0.32)
    pins.forEach(d => {
      const x = xC(d.colIdx)
      const row = x >= lastX[0] + 2 * r + 3 ? 0 : 1
      lastX[row] = x
      const cy = pinY + (row === 0 ? pinH * 0.32 : pinH * 0.72)
      s += `<line x1="${x}" y1="${graphBot - 4}" x2="${x}" y2="${cy}" stroke="${d.color}" stroke-width="1"/>`
      s += `<circle cx="${x}" cy="${cy}" r="${r}" fill="${P.bg}" stroke="${d.color}" stroke-width="1.2"/>`
      s += `<text x="${x}" y="${cy + r * 0.55}" font-size="${r * 1.5}" font-weight="700" fill="${d.color}" text-anchor="middle">${d.n}</text>`
    })
  }

  // ── time band ──
  s += `<rect x="0" y="${timeY}" width="${VB_W}" height="${timeH}" fill="${P.timeBg}"/>`
  s += `<line x1="0" y1="${timeY}" x2="${VB_W}" y2="${timeY}" stroke="${P.gridMaj}" stroke-width="0.8"/>`
  s += `<line x1="0" y1="${timeY + timeH}" x2="${VB_W}" y2="${timeY + timeH}" stroke="${P.gridMaj}" stroke-width="0.8"/>`
  s += `<text x="${LBL - 8}" y="${timeY + timeH / 2 + 3.5}" font-size="9.5" fill="${P.faint}" text-anchor="end">${S.time}</text>`
  // Time labels land on sampled columns only; further decimated to stay legible.
  const sampledCount = Math.ceil(nCols / step)
  const labelEvery = step * Math.max(1, Math.ceil(sampledCount / 13))
  for (let c = c0; c <= c1; c++) if ((c - c0) % labelEvery === 0) {
    const x = xC(c)
    const anchor = x < LBL + 24 ? "start" : "middle"
    s += `<text x="${anchor === "start" ? xL(c) + 2 : x}" y="${timeY + timeH / 2 + 4}" font-size="11" font-family="Consolas,monospace" font-weight="700" fill="${P.timeTxt}" text-anchor="${anchor}">${colToHHMM(c, startISO)}</text>`
  }

  // ── numeric vitals grid — each sampled tick shows the recorded value nearest
  // inside its bucket [c, c+step), so the table stays filled whatever the
  // actual recording cadence was; cells with nothing recorded stay blank ──
  const bucketVal = (f: (v: VitalsEntry) => string, c: number) => {
    for (let k = c; k < Math.min(c + step, c1 + 1, vitals.length); k++) {
      const val = f(vitals[k] ?? {})
      if (val !== "") return val
    }
    return ""
  }
  gridDefs.forEach((row, ri) => {
    const y = gridY0 + ri * rowH
    s += `<text x="${LBL - 8}" y="${y + rowH / 2 + lblFs / 2 - 1}" font-size="${lblFs}" font-weight="700" fill="${P.lbl}" text-anchor="end">${row.k}</text>`
    for (let c = c0; c <= Math.min(c1, vitals.length - 1); c++) {
      if (!sampled(c)) continue
      const val = bucketVal(row.f, c)
      if (val === "") continue
      const x = xC(c)
      const anchor = x < LBL + 22 ? "start" : "middle"
      s += `<text x="${anchor === "start" ? xL(c) + 2 : x}" y="${y + rowH / 2 + numFs / 2 - 1}" font-size="${numFs}" font-family="Consolas,monospace" fill="${P.ink}" text-anchor="${anchor}">${val}</text>`
    }
    s += `<line x1="0" y1="${y + rowH}" x2="${VB_W}" y2="${y + rowH}" stroke="${P.gridMin}" stroke-width="0.5"/>`
  })
  // column separators through time band + numeric grid (sampled boundaries)
  for (let c = c0; c <= c1 + 1; c += step) {
    s += `<line x1="${xL(c)}" y1="${timeY}" x2="${xL(c)}" y2="${laneY0}" stroke="${P.sep}" stroke-width="0.4"/>`
  }

  // ── lane bars (Agent / Infusion / Gas / Fluids) ──
  let r = 0
  function laneBar(label: string, start: number, end: number, color: string, text: string) {
    const y = laneY0 + r * laneH; r++
    s += `<text x="${LBL - 8}" y="${y + laneH / 2 + laneFs / 2 - 1}" font-size="${laneFs}" font-weight="700" fill="${P.lbl}" text-anchor="end">${label}</text>`
    const x1 = xL(start), w = Math.max((end - start + 1) * cW, cW)
    const barH = Math.max(laneH - 2.5, 4.5)
    s += `<rect x="${x1}" y="${y + (laneH - barH) / 2}" width="${w}" height="${barH}" rx="${Math.min(4, barH / 2)}" fill="${color}"/>`
    const t = esc(text)
    const fits = t.length * (laneFs * 0.56) + 14 < w
    if (fits) s += `<text x="${x1 + 7}" y="${y + laneH / 2 + laneFs / 2 - 1}" font-size="${laneFs}" font-weight="700" fill="#ffffff">${t}</text>`
    else      s += `<text x="${x1 + w + 5}" y="${y + laneH / 2 + laneFs / 2 - 1}" font-size="${laneFs}" font-weight="700" fill="${color}">${t}</text>`
    s += `<line x1="0" y1="${y + laneH}" x2="${VB_W}" y2="${y + laneH}" stroke="${P.gridMin}" stroke-width="0.4"/>`
  }
  agents.forEach(a => laneBar(S.agent, a.startCol ?? 0, a.endCol ?? a.startCol ?? 0, "#0d9488",
    `${clinicalDisplayLabel("option:INHALATIONAL_AGENT", a.name, locale, { label: a.name })}${a.percent != null ? ` ${a.percent} vol%` : ""}`.trim()))
  infusions.forEach(f => laneBar(S.infusion, f.startCol ?? 0, f.endCol ?? f.startCol ?? 0, "#2563eb",
    `${clinicalDisplayLabel("option:INTRAOP_INFUSION", f.name, locale, { label: f.name })} ${f.rate ?? ""} ${f.unit ?? ""}`.trim()))
  gas.forEach(g => laneBar(S.gas, g.startCol ?? 0, g.endCol ?? g.startCol ?? 0, "#0284c7", gasText(g, locale)))
  fluids.forEach(f => laneBar(S.fluids, f.startCol ?? 0, f.endCol ?? f.startCol ?? 0, "#0ea5e9",
    `${clinicalDisplayLabel("option:INTRAOP_FLUID", f.name, locale, { label: f.name })}${f.volume ? ` ${f.volume} mL` : ""}`.trim()))
  // Position lane — all segments share ONE row (they are sequential by nature).
  if (positions.length) {
    const y = laneY0 + r * laneH; r++
    s += `<text x="${LBL - 8}" y="${y + laneH / 2 + laneFs / 2 - 1}" font-size="${laneFs}" font-weight="700" fill="${P.lbl}" text-anchor="end">${S.position}</text>`
    const barH = Math.max(laneH - 2.5, 4.5)
    positions.forEach(p => {
      const x1 = xL(p.startCol), w = Math.max((p.endCol - p.startCol + 1) * cW, cW)
      s += `<rect x="${x1}" y="${y + (laneH - barH) / 2}" width="${w}" height="${barH}" rx="${Math.min(4, barH / 2)}" fill="${P.pos}"/>`
      const position = String(p.position ?? "")
      const txt = esc(clinicalDisplayLabel("option:POSITION", position, locale, { label: position }))
      const fits = txt.length * (laneFs * 0.56) + 14 < w
      if (fits) s += `<text x="${x1 + 7}" y="${y + laneH / 2 + laneFs / 2 - 1}" font-size="${laneFs}" font-weight="700" fill="#ffffff">${txt}</text>`
    })
    s += `<line x1="0" y1="${y + laneH}" x2="${VB_W}" y2="${y + laneH}" stroke="${P.gridMin}" stroke-width="0.4"/>`
  }

  // left column divider
  s += `<line x1="${LBL}" y1="0" x2="${LBL}" y2="${H}" stroke="${P.gridMaj}" stroke-width="0.7"/>`
  return s
}

export function PrintTimetable({ timetable, startISO, view, locale, themeAware }: {
  timetable: LegacyKeyEvents
  startISO?: string | null
  view?: TimetableView
  /** "bg" localizes the chart-internal labels; anything else renders English. */
  locale?: string
  /** Summary mode: follow the app theme. Print mode leaves this off — paper stays white. */
  themeAware?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef  = useRef<SVGSVGElement>(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })

  // Follow the html.dark class (toggled by the app's theme switch).
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const root = document.documentElement
    const update = () => setDark(themeAware ? root.classList.contains("dark") : false)
    const raf = requestAnimationFrame(update)
    if (!themeAware) return () => cancelAnimationFrame(raf)
    const obs = new MutationObserver(update)
    obs.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => { cancelAnimationFrame(raf); obs.disconnect() }
  }, [themeAware])

  useLayoutEffect(() => {
    if (!wrapRef.current) return
    const r = wrapRef.current.getBoundingClientRect()
    if (r.width > 10) setDims({ w: r.width, h: r.height > 10 ? r.height : Math.round(r.width * 0.6) })
  }, [])

  useEffect(() => {
    if (!wrapRef.current) return
    const obs = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (r && r.width > 10) setDims({ w: r.width, h: r.height > 10 ? r.height : Math.round(r.width * 0.6) })
    })
    obs.observe(wrapRef.current)
    return () => obs.disconnect()
  }, [])

  const vitals: VitalsEntry[] = Array.isArray(timetable?.vitals) ? timetable.vitals : []
  const drugs                 = Array.isArray(timetable?.drugs) ? timetable.drugs : []
  const agents                = Array.isArray(timetable?.agents) ? timetable.agents : []
  const infusions             = Array.isArray(timetable?.infusions) ? timetable.infusions : []
  const fluids                = Array.isArray(timetable?.fluids) ? timetable.fluids : []
  const gas                   = Array.isArray(timetable?.gasSettings) ? timetable.gasSettings : []
  const hasData = vitals.length || drugs.length || agents.length || infusions.length || fluids.length || gas.length

  const vbH = dims.w > 0 ? Math.round(VB_W * dims.h / dims.w) : 640

  useEffect(() => {
    if (!svgRef.current || !hasData) return
    svgRef.current.setAttribute("viewBox", `0 0 ${VB_W} ${vbH}`)
    svgRef.current.setAttribute("preserveAspectRatio", "none")
    svgRef.current.innerHTML = buildSVG(
      timetable, startISO, vbH, view,
      dark ? PAL_DARK : PAL_LIGHT,
      locale === "bg" ? CHART_STR.bg : CHART_STR.en,
      locale === "bg" ? "bg" : "en",
    )
  }, [timetable, startISO, vbH, hasData, view, dark, locale])

  if (!hasData) {
    return (
      <div ref={wrapRef} className="flex items-center justify-center text-[11px] text-slate-400 border border-dashed border-slate-200 rounded w-full h-full min-h-[200px]">
        No intraoperative data recorded
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="timetable-wrap" style={{ width: "100%", height: "100%" }}>
      <svg ref={svgRef} className="timetable-svg" style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  )
}
