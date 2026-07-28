// Long-case print planning — pure functions, no React/DOM.
//
// A case is charted in 5-minute columns. The printed record works like a
// paper anaesthesia chart: it NEVER compresses a long case into one squeezed
// grid — it continues onto a second half-height panel at the same visual
// rhythm. A case up to ~5 h is one full-width panel; longer cases split into
// two stacked panels (first half / second half of the case) on the same
// sheet. Only extreme cases (> ~24 h) spill onto a continuation sheet.
//
// Each panel samples its vitals NUMBER TABLE at the finest interval that
// stays legible (≤ ~24 sampled columns). Graph traces are never thinned —
// a crisis stays fully visible at any grid interval.
//
// INVARIANT: the interval applies ONLY to the vitals numeric grid sampling.
// Graph traces, drugs, fluids, events, positions and phases always render at
// their true recorded columns — never thinned, never snapped.

export const COL_MIN = 5 // minutes per chart column
export const COLS_PER_HOUR = 60 / COL_MIN

/** How many stacked panels fit on one intraop sheet. */
export const PANELS_PER_SHEET = 2

export type ColRange = { startCol: number; endCol: number } // inclusive

export type PanelPlan = {
  /** 0-based panel index across the whole case. */
  index: number
  /** 0-based intraop sheet this panel lands on (PANELS_PER_SHEET per sheet). */
  sheet: number
  startCol: number
  endCol: number
  /** Vitals NUMERIC-GRID sampling interval for this panel (graph is full-res). */
  intervalMin: 5 | 10 | 15 | 20 | 30
}

/** Legacy duration → interval mapping (kept for compatibility/reference). */
export function defaultIntervalMin(durationMin: number): 5 | 10 | 15 | 20 {
  if (durationMin <= 120) return 5
  if (durationMin <= 240) return 10
  if (durationMin <= 480) return 15
  return 20
}

export type VitalsColLike = { systolic?: number | null }

/**
 * Detect "critical" column ranges: any pair of SBP readings within `windowMin`
 * minutes differing by more than `sbpDelta` mmHg. Not used by the panel
 * planner (the full-resolution graph carries crisis detail); exported for
 * renderers that want to highlight critical windows.
 */
export function detectCriticalCols(
  vitals: VitalsColLike[] | undefined,
  opts: { sbpDelta?: number; windowMin?: number } = {},
): ColRange[] {
  const sbpDelta = opts.sbpDelta ?? 30
  const windowCols = Math.max(1, Math.round((opts.windowMin ?? 10) / COL_MIN))
  if (!Array.isArray(vitals) || vitals.length === 0) return []

  const flagged = new Set<number>()
  for (let a = 0; a < vitals.length; a++) {
    const va = vitals[a]?.systolic
    if (va == null) continue
    for (let b = a + 1; b <= a + windowCols && b < vitals.length; b++) {
      const vb = vitals[b]?.systolic
      if (vb == null) continue
      if (Math.abs(Number(vb) - Number(va)) > sbpDelta) {
        for (let c = a; c <= b; c++) flagged.add(c)
      }
    }
  }
  const cols = [...flagged].sort((x, y) => x - y)
  const out: ColRange[] = []
  for (const c of cols) {
    const last = out[out.length - 1]
    if (last && c <= last.endCol + 1) last.endCol = c
    else out.push({ startCol: c, endCol: c })
  }
  return out
}

/** Candidate numeric-grid steps in columns (5/10/15/20/30 min), finest first. */
const STEPS_COLS = [1, 2, 3, 4, 6] as const

/** Finest interval whose sampled column count fits the per-panel budget. */
function fitIntervalMin(cols: number, budget: number): PanelPlan["intervalMin"] {
  for (const step of STEPS_COLS) {
    if (Math.ceil(cols / step) <= budget) return (step * COL_MIN) as PanelPlan["intervalMin"]
  }
  return 30
}

export type PlanPanelsInput = {
  /** Total chart columns (case duration / 5 min, at least 1). */
  totalCols: number
  /**
   * Max sampled numeric columns that stay legible on one panel
   * (BP "120/80" text is the widest row). Default 24.
   */
  sampledBudget?: number
}

/** A single panel never spans more than this (12 h at q30 = 24 sampled cols). */
const MAX_PANEL_COLS = 144
/** Cases at or under this stay a single full-height panel (~5 h). */
const SINGLE_PANEL_MAX_COLS = 60

/**
 * Plan the stacked intraop chart panels.
 *
 * - ≤ ~5 h → ONE full-height panel.
 * - longer → 2 equal panels (boundary snapped to the hour) stacked on the
 *   same sheet: first half of the case on top, second half below.
 * - > ~24 h → more panels, PANELS_PER_SHEET per sheet, continuation sheets.
 */
export function planPanels(input: PlanPanelsInput): PanelPlan[] {
  const totalCols = Math.max(1, Math.floor(input.totalCols))
  const budget = Math.max(10, input.sampledBudget ?? 24)

  if (totalCols <= SINGLE_PANEL_MAX_COLS) {
    return [{
      index: 0, sheet: 0, startCol: 0, endCol: totalCols - 1,
      intervalMin: fitIntervalMin(totalCols, budget),
    }]
  }

  // At least two panels; more only when a half would exceed MAX_PANEL_COLS.
  let nPanels = 2
  while (Math.ceil(totalCols / nPanels) > MAX_PANEL_COLS) nPanels++

  // Equal chunks with hour-snapped boundaries.
  const plans: PanelPlan[] = []
  let start = 0
  for (let i = 0; i < nPanels; i++) {
    const rawEnd = Math.round(((i + 1) * totalCols) / nPanels / COLS_PER_HOUR) * COLS_PER_HOUR
    const end = i === nPanels - 1
      ? totalCols
      : Math.min(Math.max(rawEnd, start + COLS_PER_HOUR), totalCols - COLS_PER_HOUR)
    plans.push({
      index: i,
      sheet: Math.floor(i / PANELS_PER_SHEET),
      startCol: start,
      endCol: end - 1,
      intervalMin: fitIntervalMin(end - start, budget),
    })
    start = end
  }
  return plans
}
