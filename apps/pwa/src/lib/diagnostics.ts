/**
 * A small in-memory record of what the app just did, readable on the device.
 *
 * This exists because a performance complaint from a phone in another building
 * is otherwise unfalsifiable. Chasing "tabs take 5-10 seconds" through a
 * browser harness produced three confident and wrong diagnoses; the PWA cannot
 * reproduce native timing, and there is no profiler to attach remotely. A
 * number the clinician can read aloud is worth more than any amount of
 * inference.
 *
 * Deliberately in memory only: it is a live diagnostic, not a log, and clinical
 * storage is not the place for telemetry.
 */

const MAX_SAMPLES = 20

export type TimingSample = {
  label: string
  ms: number
  /** Milliseconds since the app started, so samples can be ordered. */
  at: number
  /**
   * What else was happening. A duration alone cannot distinguish "this render
   * is expensive" from "this interaction waited on something", and that
   * distinction is the whole question.
   */
  note?: string
}

const started = Date.now()
const samples: TimingSample[] = []

export function recordTiming(label: string, ms: number, note?: string): void {
  samples.unshift({ label, ms, at: Date.now() - started, ...(note ? { note } : {}) })
  if (samples.length > MAX_SAMPLES) samples.length = MAX_SAMPLES
}

export function recentTimings(): readonly TimingSample[] {
  return samples
}

export function clearTimings(): void {
  samples.length = 0
}

/**
 * Where the time inside one intraop render went.
 *
 * Measuring the switch end-to-end proved it was the render phase, not waiting —
 * but "the render is slow" is not yet a defect anyone can fix. These split that
 * 1.5 s into the parts that can each be attacked separately.
 */
export type RenderPhases = {
  /** Constructing the active tab's props. */
  buildTab: number
  /** `useStableRenderModel` walking those props. */
  walkTab: number
  /** Constructing props for all fourteen sheets. */
  buildSheets: number
  /** `useStableRenderModel` walking the sheet props. */
  walkSheets: number
  /** React's own measure of rendering the tab subtree. */
  tabTree: number
  /** React's own measure of rendering the fourteen sheets. */
  sheetTree: number
}

let phases: Partial<RenderPhases> = {}

export function recordRenderPhases(next: Partial<RenderPhases>): void {
  phases = { ...phases, ...next }
}

/** Reads and clears — each tab switch reports its own render, not a running total. */
export function takeRenderPhases(): Partial<RenderPhases> {
  const out = phases
  phases = {}
  return out
}

export function formatRenderPhases(p: Partial<RenderPhases>): string {
  const ms = (n: number | undefined) => (n === undefined ? "?" : Math.round(n))
  return `build ${ms(p.buildTab)}+${ms(p.buildSheets)} · walk ${ms(p.walkTab)}+${ms(p.walkSheets)}`
    + ` · tree tab ${ms(p.tabTree)} sheets ${ms(p.sheetTree)}`
}

export function timingSummary(): { count: number; worst: number; median: number } {
  if (samples.length === 0) return { count: 0, worst: 0, median: 0 }
  const sorted = [...samples].map(s => s.ms).sort((a, b) => a - b)
  return {
    count: sorted.length,
    worst: sorted[sorted.length - 1] ?? 0,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
  }
}
