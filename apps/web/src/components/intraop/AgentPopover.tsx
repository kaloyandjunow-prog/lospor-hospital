"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { DoseSelector } from "./DoseSelector"
import { useIntraopUiCopy } from "./ui-copy"

/**
 * Starting or editing a volatile agent, and its inspired concentration.
 *
 * The important behaviour here is that choosing an agent *selects* it rather
 * than starting it. Web used to commit the segment on the first click, which
 * meant the concentration on the record was a default nobody had chosen — the
 * clinician picked "Sevoflurane" and the chart decided the percentage. Mobile's
 * AgentSheet sets the agent and its first quick value and then waits for
 * confirmation, and this now does the same.
 *
 * Presentational: it reports the selection and the timetable owns the chart.
 */

export type AgentPopoverProps = {
  anchor: { top: number; bottom: number; left: number; right: number; width: number }
  /** The agent already running at this column, if this is an edit. */
  editingName: string | null
  /** Agent chosen but not yet started. */
  pendingName: string | null
  percent: number | null
  nitrousPercent: number | null
  prospectiveGuidanceEnabled: boolean
  agentNames: readonly string[]
  quickPercentsFor: (agent: string) => number[]
  textClassFor: (agent: string) => string
  displayAgentName: (name: string) => string
  labels: { startAgentHere: string; optional: string }
  onSelectAgent: (agent: string) => void
  onPercentChange: (percent: number) => void
  onNitrousChange: (percent: number | null) => void
  onStart: (agent: string) => void
  onApply: () => void
  onDismiss: () => void
}

const POPOVER_WIDTH = 190
const DEFAULT_QUICK_PERCENTS = [0.5, 1, 1.5, 2, 3]
const DEFAULT_NITROUS_PERCENT = 40
const captionClass = "text-[9px] text-slate-400 font-semibold uppercase tracking-wide"

export function AgentPopover({
  anchor,
  editingName,
  pendingName,
  percent,
  nitrousPercent,
  prospectiveGuidanceEnabled,
  agentNames,
  quickPercentsFor,
  textClassFor,
  displayAgentName,
  labels,
  onSelectAgent,
  onPercentChange,
  onNitrousChange,
  onStart,
  onApply,
  onDismiss,
}: AgentPopoverProps) {
  const copy = useIntraopUiCopy()
  const [nitrousOpen, setNitrousOpen] = useState(nitrousPercent !== null)
  if (typeof document === "undefined") return null

  const showAbove = window.innerHeight - anchor.bottom < 240
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - POPOVER_WIDTH - 8))
  const top = showAbove ? anchor.top - 4 : anchor.bottom + 4

  const activeAgent = editingName ?? pendingName
  const quick = prospectiveGuidanceEnabled && activeAgent
    ? (quickPercentsFor(activeAgent).length ? quickPercentsFor(activeAgent) : DEFAULT_QUICK_PERCENTS)
    : []

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onDismiss} />
      <div
        style={{
          position: "fixed",
          left,
          top,
          width: POPOVER_WIDTH,
          zIndex: 9999,
          transform: showAbove ? "translateY(-100%)" : undefined,
        }}
        className="bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl p-3 space-y-2"
        onClick={event => event.stopPropagation()}
      >
        <p className={captionClass}>
          {editingName ? copy.editAgent(displayAgentName(editingName)) : labels.startAgentHere}
        </p>

        {!editingName && (
          <div className="space-y-0.5">
            {agentNames.map(agent => (
              <button
                key={agent}
                type="button"
                onClick={() => onSelectAgent(agent)}
                className={`w-full text-left text-xs font-semibold px-2 py-1.5 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-[#333] ${textClassFor(agent)}`}
              >
                {displayAgentName(agent)}
              </button>
            ))}
          </div>
        )}

        {/* Agents always dose in %, so there is no unit or route to choose. */}
        {activeAgent && (
          <div className="border-t border-slate-100 dark:border-[#333] pt-2">
            <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wide mb-1.5">
              Fi{activeAgent}
            </p>
            <DoseSelector
              accent="purple"
              quickValues={quick}
              value={percent != null ? String(percent) : quick[0] != null ? String(quick[0]) : ""}
              onValueChange={value => onPercentChange(parseFloat(value) || 0)}
              min={0} max={10} step={0.1} unitSuffix="%"
              manualEntryOnly={!prospectiveGuidanceEnabled}
              showGuidance={prospectiveGuidanceEnabled}
              confirmLabel={!editingName ? copy.startAgent(displayAgentName(activeAgent)) : undefined}
              onConfirm={!editingName ? () => onStart(activeAgent) : undefined}
              confirmDisabled={!editingName && percent == null && quick[0] == null}
            />
          </div>
        )}

        <div className="border-t border-slate-100 dark:border-[#333] pt-2 space-y-2">
          <p className={captionClass}>{labels.optional}</p>
          <button
            type="button"
            onClick={() => {
              if (nitrousOpen) {
                setNitrousOpen(false)
                onNitrousChange(null)
              } else {
                setNitrousOpen(true)
                if (prospectiveGuidanceEnabled) onNitrousChange(DEFAULT_NITROUS_PERCENT)
              }
            }}
            className={`w-full text-xs font-semibold px-2 py-1 rounded-lg border transition-colors ${
              nitrousOpen
                ? "bg-yellow-400 border-yellow-400 text-white"
                : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-yellow-400 hover:text-yellow-600"
            }`}
          >
            + N2O
          </button>
          {nitrousOpen && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-slate-500 font-semibold">FiN2O</span>
                <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400">{nitrousPercent ?? ""}%</span>
              </div>
              {prospectiveGuidanceEnabled ? (
                <input
                  type="range" min={10} max={70} step={5}
                  value={nitrousPercent ?? DEFAULT_NITROUS_PERCENT}
                  onChange={event => onNitrousChange(parseInt(event.target.value))}
                  className="w-full h-1.5 accent-yellow-500"
                />
              ) : (
                <input
                  type="number"
                  value={nitrousPercent ?? ""}
                  onChange={event => onNitrousChange(event.target.value ? parseFloat(event.target.value) : null)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-xs outline-none focus:border-yellow-400 dark:border-[#3a3a3a] dark:bg-[#2a2a2a]"
                />
              )}
            </div>
          )}
        </div>

        {editingName && (
          <button
            type="button"
            onClick={onApply}
            className="w-full text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-1.5 transition-colors"
          >
            {copy.apply}
          </button>
        )}
      </div>
    </>,
    document.body,
  )
}
