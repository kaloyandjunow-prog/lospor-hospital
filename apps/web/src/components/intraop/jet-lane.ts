import type { JetSegment, TimetableData } from "@lospor/core/intraop-types"

/**
 * The jet ventilation lane on the web chart (10.2.0), as the gas settings
 * lane works: a run starts at a column, a later column records a change of
 * pressure, rate or FiO2, and a stop ends it. The chart edit turns each into
 * Core's jet_start / jet_change / jet_stop events.
 */

export type JetSettings = { pressureBar: number; rate: number; fio2: number }

/** What the first run of a case opens with; later runs open with the last one's settings. */
export const DEFAULT_JET_SETTINGS: JetSettings = { pressureBar: 2, rate: 150, fio2: 100 }

/** The settings in force at a column, and the column they were set at. */
export function jetSettingsAtColumn(seg: JetSegment, col: number): JetSettings & { changeCol: number } {
  const change = [...(seg.settingsChanges ?? [])].filter(item => item.col <= col).sort((a, b) => a.col - b.col).pop()
  return change
    ? { pressureBar: change.pressureBar, rate: change.rate, fio2: change.fio2, changeCol: change.col }
    : { pressureBar: seg.pressureBar, rate: seg.rate, fio2: seg.fio2, changeCol: seg.startCol }
}

/** The run covering a column, if any. */
export function jetSegmentAt(data: TimetableData, col: number): JetSegment | null {
  return (data.jetSettings ?? []).find(seg => seg.startCol <= col && col <= seg.endCol) ?? null
}

export function startJet(data: TimetableData, col: number, settings: JetSettings, id: string): TimetableData {
  // One run at a time: a running one ends where the new one starts.
  const runs = (data.jetSettings ?? []).map(seg => !seg.stopped && seg.startCol < col && seg.endCol >= col
    ? { ...seg, endCol: col - 1, stopped: true as const }
    : seg)
  return { ...data, jetSettings: [...runs, { id, startCol: col, endCol: col, ...settings }] }
}

/** New settings from a column: at the start they replace the start's, later they are a change. */
export function changeJet(data: TimetableData, segId: string, col: number, settings: JetSettings): TimetableData {
  return {
    ...data,
    jetSettings: (data.jetSettings ?? []).map(seg => {
      if (seg.id !== segId) return seg
      if (col === seg.startCol) return { ...seg, ...settings }
      const changes = (seg.settingsChanges ?? []).filter(item => item.col !== col)
      return { ...seg, settingsChanges: [...changes, { col, ...settings }].sort((a, b) => a.col - b.col) }
    }),
  }
}

export function stopJet(data: TimetableData, segId: string, col: number): TimetableData {
  return {
    ...data,
    jetSettings: (data.jetSettings ?? []).map(seg => seg.id === segId ? { ...seg, endCol: Math.max(col, seg.startCol), stopped: true } : seg),
  }
}
