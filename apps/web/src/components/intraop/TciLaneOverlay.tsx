"use client"

import { useMemo } from "react"
import { tciPointsUpTo, tciPrediction, TCI_DRUG_SPECS, TCI_MODEL_DRUG, TCI_MODEL_LABELS } from "@lospor/core/tci"
import type { PumpTotalUnit, TimetableInfusion } from "@lospor/core/intraop-types"
import { useTciPatient } from "./tci-patient-context"

const COLUMN_MS = 5 * 60_000

export type TciLanePrediction = { points: { atMs: number; ce: number; cp: number }[]; max: number; site: "PLASMA" | "EFFECT" }

/**
 * Each TCI bar's predicted concentration over the time it ran (2026-10-18):
 * the effect site when it targets Ce, the plasma when it targets Cp. A bar
 * still running is predicted to the end of its last drawn column. Recomputed
 * when the bar changes.
 */
export function useTciLanePredictions(segments: readonly TimetableInfusion[]): Map<string, TciLanePrediction> {
  const patient = useTciPatient()
  const key = segments.filter(seg => seg.tciModel).map(seg => `${seg.id}:${seg.rate}:${seg.endTs ?? ""}:${(seg.rateChanges ?? []).map(rc => `${rc.ts}=${rc.rate}`).join(",")}`).join("|")
  return useMemo(() => {
    const out = new Map<string, TciLanePrediction>()
    for (const seg of segments) {
      if (!seg.tciModel || seg.planned || !seg.startTs) continue
      const startMs = Date.parse(seg.startTs)
      // A running bar is predicted to the end of its last drawn column (render stays pure).
      const endMs = seg.endTs ? Date.parse(seg.endTs) : (Math.floor(startMs / COLUMN_MS) + seg.endCol - seg.startCol + 1) * COLUMN_MS
      const changes = [
        { atMs: startMs, target: Number(seg.rate) || 0 },
        ...(seg.rateChanges ?? []).filter(rc => !rc.planned && rc.ts).map(rc => ({ atMs: Date.parse(rc.ts!), target: Number(rc.rate) || 0 })),
      ].filter(change => change.atMs <= endMs)
      const points = tciPrediction({ ...seg, tciModel: seg.tciModel }, changes, endMs, patient)
      if (!points.length) continue
      out.set(seg.id, { points, max: Math.max(...changes.map(change => change.target)) * 1.25, site: seg.tciSite ?? "EFFECT" })
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on what the prediction reads
  }, [key, patient])
}

/** The predicted line inside one column's pill: that cell's five minutes, scaled to the targets. */
export function TciCellLine({ seg, column, prediction, color }: {
  seg: TimetableInfusion
  column: number
  prediction: TciLanePrediction | undefined
  color: string
}) {
  if (!prediction || !seg.startTs) return null
  const first = Math.floor(Date.parse(seg.startTs) / COLUMN_MS) * COLUMN_MS
  const from = first + (column - seg.startCol) * COLUMN_MS
  const to = from + COLUMN_MS
  const inside = prediction.points.slice(tciPointsUpTo(prediction.points, from - 60_001), tciPointsUpTo(prediction.points, to + 60_000))
  if (inside.length < 2) return null
  const value = (point: { ce: number; cp: number }) => prediction.site === "EFFECT" ? point.ce : point.cp
  const path = inside.map(point => `${((point.atMs - from) / COLUMN_MS) * 100},${100 - Math.min(100, (value(point) / prediction.max) * 100)}`).join(" ")
  return (
    <svg data-testid="tci-predicted-line" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points={path} fill="none" stroke={color} strokeWidth={2} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" opacity={0.85} />
    </svg>
  )
}

/** The infusion menu's pump-total field for a TCI bar; none for any other infusion. */
export function tciPumpTotal(
  seg: TimetableInfusion | undefined,
  onSave: (pump?: { value: number; unit: PumpTotalUnit }) => void,
): { amountUnit: "mg" | "mcg"; value?: number; unit?: PumpTotalUnit; onSave: typeof onSave } | undefined {
  if (!seg?.tciModel) return undefined
  return { amountUnit: TCI_DRUG_SPECS[TCI_MODEL_DRUG[seg.tciModel]].units.amount, value: seg.pumpTotal, unit: seg.pumpTotalUnit, onSave }
}

/** "Ce 4 mcg/mL" (and the model at the start) for a TCI bar's label. */
export function tciLaneLabel(seg: TimetableInfusion, rate: string | number, unit: string, atStart: boolean): string | null {
  if (!seg.tciModel) return null
  const site = seg.tciSite === "PLASMA" ? "Cp" : "Ce"
  return `${site} ${rate} ${unit}${atStart ? ` · ${TCI_MODEL_LABELS[seg.tciModel]}` : ""}`
}
