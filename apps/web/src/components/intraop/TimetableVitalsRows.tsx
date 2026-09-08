"use client"

import { cvpToDisplay } from "@lospor/core/monitoring-values"

import { nextVitalsField } from "./vitals-navigation"
import type { VITAL_ROW_DEFS } from "./TimetableVitalsChart"
import type { VitalsEntry } from "@/types/timetable"

/**
 * What a cell shows, given what is stored.
 *
 * Only CVP differs: it is always stored in mmHg and may be displayed in cmH2O.
 * The row's own unit label is what decides, so the number and the unit beside
 * it cannot disagree -- if the label says cmH₂O the value has been converted,
 * and if it says mmHg it has not.
 */
function displayVital(
  row: (typeof VITAL_ROW_DEFS)[number],
  stored: number | undefined,
): number | string {
  if (stored == null) return ""
  if (row.key === "cvp" && row.unit === "cmH₂O") return cvpToDisplay(stored, "cmH2O")
  return stored
}

/**
 * The numbers themselves: one row per monitored vital, one cell per five
 * minutes.
 *
 * Which rows appear is decided by what is being monitored, so a case without
 * invasive pressure has no arterial line to leave blank. When nothing is
 * monitored at all the grid says so rather than rendering as an empty band,
 * which would read as a chart that failed to load.
 *
 * Tab walks down a column and then jumps to the top of the next one, because
 * observations are read out as a set for one time rather than as one number
 * across the case. Enter opens the stepper for the cell, pre-filled with the
 * last value recorded for that vital — most entries are a small change from the
 * previous one, not a fresh number.
 *
 * Presentational: every change goes back through the callbacks.
 */

export type VitalRowDef = (typeof VITAL_ROW_DEFS)[number]

export type VitalsPopupRequest = {
  col: number
  key: VitalRowDef["key"]
  min: number
  max: number
  step: number
  defaultVal: number
  /**
   * Whether defaultVal is the previous reading in this case or a population
   * figure nobody has observed.
   *
   * Dismissing the stepper commits defaultVal, which is deliberate when it
   * carries the last reading forward -- that is how "unchanged" is charted
   * without retyping. It is not defensible when there is no previous reading,
   * because then the committed value was never measured.
   */
  defaultIsPriorReading: boolean
  label: string
  unit: string
  color: string
  rect: DOMRect
}

export type TimetableVitalsRowsProps = {
  rows: VitalRowDef[]
  vitals: VitalsEntry[]
  /** Absolute column indices this chart row covers. */
  rowCols: number[]
  colCount: number
  colW: number
  labelWidth: number
  rowLabelClass: string
  cellClass: string
  /** Shown in place of the grid when nothing is being monitored. */
  emptyLabel: string
  isFirstRow: boolean
  inputRefs: React.RefObject<Map<string, HTMLInputElement>>
  setVital: (col: number, key: VitalRowDef["key"], raw: string) => void
  /** Last value recorded for this vital before this column, if any. */
  lastVitalBefore: (col: number, key: VitalRowDef["key"]) => number | null | undefined
  onOpenStepper: (request: VitalsPopupRequest) => void
}

export function TimetableVitalsRows({
  rows,
  vitals,
  rowCols,
  colCount,
  colW,
  labelWidth,
  rowLabelClass,
  cellClass,
  emptyLabel,
  isFirstRow,
  inputRefs,
  setVital,
  lastVitalBefore,
  onOpenStepper,
}: TimetableVitalsRowsProps) {
  if (rows.length === 0) {
    return isFirstRow ? (
      <div className="flex items-center border-b border-slate-50 dark:border-[#222] py-2">
        <div style={{ width: labelWidth, minWidth: labelWidth }} className={rowLabelClass + " py-2"} />
        <span className="text-[10px] text-slate-300 dark:text-[#555] italic px-3">{emptyLabel}</span>
      </div>
    ) : null
  }

  return (
    <>
      {rows.map((row, ri) => {
        const stepperFor = (col: number, rect: DOMRect): VitalsPopupRequest => ({
          col,
          key: row.key,
          min: row.min,
          max: row.max,
          step: row.step,
          // Most entries are a small change from the last one, so the stepper
          // opens there rather than at a population default.
          defaultVal: lastVitalBefore(col, row.key) ?? row.defaultVal,
          defaultIsPriorReading: lastVitalBefore(col, row.key) != null,
          label: row.label,
          unit: row.unit,
          color: row.color,
          rect,
        })

        return (
          <div
            key={row.key}
            className={`flex items-center border-b border-slate-50 dark:border-[#222] ${ri % 2 === 1 ? "bg-slate-50/40 dark:bg-[#1a1a1a]/60" : ""}`}
          >
            <div
              style={{
                width: labelWidth,
                minWidth: labelWidth,
                position: "sticky",
                left: 0,
                zIndex: 2,
                backgroundColor: "inherit",
                borderLeft: `3px solid ${row.color}`,
              }}
              className="flex flex-col items-end justify-center pr-2 py-1.5 gap-0 select-none bg-white dark:bg-[#1c1c1c]"
            >
              <span className="text-xs font-semibold uppercase tracking-wide leading-tight" style={{ color: row.color }}>
                {row.label}
              </span>
              <span className="text-[10px] text-slate-300 dark:text-[#555] leading-tight">({row.unit})</span>
            </div>
            {rowCols.map(ci => (
              <div
                key={ci}
                style={{ width: colW, minWidth: colW, borderLeft: `1px solid ${row.color}20` }}
                className="px-1 py-1.5"
              >
                <input
                  type="number"
                  tabIndex={-1}
                  min={row.min}
                  max={row.max}
                  placeholder="."
                  // CVP is stored in mmHg and may be shown in cmH2O. The row's
                  // own unit label decides, so what is displayed and what it
                  // claims to be cannot drift apart. Every other vital is
                  // stored in the unit it is shown in.
                  value={displayVital(row, vitals[ci]?.[row.key])}
                  onChange={e => setVital(ci, row.key, e.target.value)}
                  ref={el => {
                    const k = `${ci}-${row.key}`
                    if (el) inputRefs.current.set(k, el)
                    else inputRefs.current.delete(k)
                  }}
                  onDoubleClick={e => { e.stopPropagation(); onOpenStepper(stepperFor(ci, e.currentTarget.getBoundingClientRect())) }}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      onOpenStepper(stepperFor(ci, e.currentTarget.getBoundingClientRect()))
                      return
                    }
                    if (e.key !== "Tab") return
                    e.preventDefault()
                    const next = nextVitalsField({
                      rowKeys: rows.map(r => r.key),
                      currentKey: row.key,
                      col: ci,
                      colCount,
                    })
                    if (next) inputRefs.current.get(`${next.col}-${next.key}`)?.focus()
                  }}
                  className={cellClass}
                />
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
