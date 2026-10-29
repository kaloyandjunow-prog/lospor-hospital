import { useState } from "react"
import type { RefObject } from "react"
import type { TimetableData, AgentSegment } from "@/components/IntraopTimetable"

/**
 * What applying the agent editor at a column means (10.0.0): at the bar's
 * start it corrects the starting percent, on an existing change it corrects
 * that change (both edits, kept in the audit log), and anywhere else it is a
 * new concentration from that time, as the phone records one.
 */
export type AgentEditMode = "start" | "change" | "new"

export function agentEditMode(seg: AgentSegment, atCol: number): AgentEditMode {
  if (atCol <= seg.startCol) return "start"
  return (seg.percentChanges ?? []).some(change => change.col === atCol) ? "change" : "new"
}

/** The percent in force at a column: the change there if any, else the last one before it, else the start's. */
export function agentPercentAt(seg: AgentSegment, atCol: number): number | undefined {
  const changes = (seg.percentChanges ?? []).filter(change => change.col === atCol || (!change.planned && change.col < atCol))
  return changes.sort((a, b) => a.col - b.col).pop()?.percent ?? seg.percent
}

// Agents carry their own picker-popover UI state (which cell's picker is
// open, its screen position, the pending N2O selection) alongside the same
// start/extend/resume/continue lifecycle infusions and fluids have — the
// hook owns both so the popover's open/closed state travels with the rest
// of the domain instead of living separately in the parent component.
export function useAgentHandlers(
  data: TimetableData,
  onChange: (d: TimetableData) => void,
  dataRef: RefObject<TimetableData>,
  onChangeRef: RefObject<(d: TimetableData) => void>,
  nowCol: number | null,
  /** Another agent was running where this one started: offer the switch. */
  onStartedAlongside?: (started: string, running: AgentSegment[], col: number) => void,
) {
  const agents = data.agents ?? []

  const [agentPicker, setAgentPicker]         = useState<number | null>(null)
  const [agentPickerRect, setAgentPickerRect] = useState<DOMRect | null>(null)
  const [pickerN2o, setPickerN2o]             = useState<number | null>(null)
  const [pickerPercent, setPickerPercent]     = useState<number | null>(null)
  const [pendingAgentName, setPendingAgentName] = useState<string | null>(null)
  // The column the editor was opened on, which decides what applying it means.
  const [pickerAtCol, setPickerAtCol]         = useState<number | null>(null)

  function closeAgentPicker() { setAgentPicker(null); setAgentPickerRect(null); setPendingAgentName(null) }

  function startAgent(col: number, name: string, percentParam?: number | null) {
    const n2o     = pickerN2o !== null ? pickerN2o : undefined
    const percent = percentParam !== undefined
      ? (percentParam !== null ? percentParam : undefined)
      : (pickerPercent !== null ? pickerPercent : undefined)
    // Several agents may run at once (1.4.9): starting one never stops another
    // by itself. Switching is an explicit stop, offered right after.
    const running = agents.filter(a => a.name !== name && !a.stopped && !a.planned && a.startCol <= col && col <= a.endCol)
    const updated = agents.filter(a => !(a.startCol === col && a.name === name))
    onChange({ ...data, agents: [...updated, { name, startCol: col, endCol: col, n2o, percent }] })
    closeAgentPicker(); setPickerN2o(null); setPickerPercent(null)
    if (running.length > 0) onStartedAlongside?.(name, running, col)
  }

  function updateAgentExtras(startCol: number) {
    const n2o = pickerN2o !== null ? pickerN2o : undefined
    const percent = pickerPercent !== null ? pickerPercent : undefined
    onChange({ ...data, agents: agents.map(a => {
      if (a.startCol !== startCol) return a
      const at = pickerAtCol ?? a.startCol
      const mode = agentEditMode(a, at)
      if (mode === "start" || percent === undefined) return { ...a, n2o, ...(mode === "start" ? { percent } : {}) }
      const changes = a.percentChanges ?? []
      if (mode === "change") return { ...a, n2o, percentChanges: changes.map(change => change.col === at ? { ...change, percent } : change) }
      // The same concentration again is not a change.
      if (agentPercentAt(a, at) === percent) return { ...a, n2o }
      return { ...a, n2o, percentChanges: [...changes, { col: at, percent }].sort((x, y) => x.col - y.col) }
    }) })
    closeAgentPicker(); setPickerN2o(null); setPickerPercent(null)
  }

  function openPickerForSeg(ci: number, seg: AgentSegment, rect: DOMRect, atCol: number = ci) {
    if (agentPicker === ci && pickerAtCol === atCol) { setAgentPicker(null); setAgentPickerRect(null); return }
    setPickerN2o(seg.n2o ?? null)
    setPickerPercent(agentPercentAt(seg, atCol) ?? null)
    setPendingAgentName(null)
    setPickerAtCol(atCol)
    setAgentPicker(ci)
    setAgentPickerRect(rect)
  }

  function openPickerEmpty(ci: number, rect: DOMRect) {
    if (agentPicker === ci) { setAgentPicker(null); setAgentPickerRect(null); return }
    setPickerN2o(null)
    setPickerPercent(null)
    setPendingAgentName(null)
    setAgentPicker(ci)
    setAgentPickerRect(rect)
  }

  function removeSegment(startCol: number) {
    onChange({ ...data, agents: agents.filter(a => a.startCol !== startCol) })
    closeAgentPicker()
  }

  // 1.4.9: a bar's end is its stop. Dropping the end grip stops it at that
  // column (a planned stop if the column is still ahead); on a stopped bar it
  // moves the stop. A running bar otherwise ends at "now" by itself.
  function extendSegment(startCol: number, newEndCol: number) {
    const d = dataRef.current; onChangeRef.current({ ...d, agents: d.agents.map(a => a.startCol === startCol ? { ...a, endCol: newEndCol, plannedStopCol: undefined, stopped: true } : a) })
  }

  function resumeSegment(startCol: number) {
    const d = dataRef.current; onChangeRef.current({ ...d, agents: d.agents.map(a => a.startCol === startCol ? { ...a, stopped: undefined } : a) })
  }

  function continueAgent(source: AgentSegment, col: number) {
    const d = dataRef.current
    const startCol = col
    const endCol   = Math.max(nowCol ?? col, col)
    onChangeRef.current({ ...d, agents: [...d.agents, { name: source.name, startCol, endCol, n2o: source.n2o, percent: source.percent, stopped: undefined }] })
  }

  return {
    agents, agentPicker, agentPickerRect, pickerAtCol, pickerN2o, setPickerN2o, pickerPercent, setPickerPercent,
    pendingAgentName, setPendingAgentName,
    startAgent, updateAgentExtras, openPickerForSeg, openPickerEmpty, closeAgentPicker,
    removeSegment, extendSegment, resumeSegment, continueAgent,
  }
}
