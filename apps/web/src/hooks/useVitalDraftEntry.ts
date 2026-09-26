import type { VitalKey } from "@/types/timetable"
import { useCallback, useState } from "react"
import { type IntraopVitalKey } from "@lospor/core/intraop-vitals"
import { evaluateVitalInput } from "@/lib/intraop-vital-entry"

/**
 * Tracks in-progress vital text that fails validation, keyed "${col}-${key}",
 * so a hard-invalid draft stays visible and blocking in the grid and the
 * entry popover instead of silently reverting or committing.
 */
export function useVitalDraftEntry({
  setVitalCell,
  cvpUnit,
}: {
  setVitalCell: (col: number, key: VitalKey, raw: string) => void
  cvpUnit: "mmHg" | "cmH2O"
}) {
  const [vitalDrafts, setVitalDrafts] = useState<Record<string, string>>({})
  const [activeVitalCell, setActiveVitalCell] = useState<string | null>(null)

  const setVital = useCallback((col: number, key: VitalKey, raw: string) => {
    const cellKey = `${col}-${key}`
    const feedback = evaluateVitalInput(
      key as IntraopVitalKey,
      raw,
      key === "cvp" ? cvpUnit : "mmHg",
    )
    if (feedback.error) {
      setVitalDrafts(current => current[cellKey] === raw ? current : { ...current, [cellKey]: raw })
      return
    }
    setVitalDrafts(current => {
      if (current[cellKey] === undefined) return current
      const next = { ...current }
      delete next[cellKey]
      return next
    })
    setVitalCell(col, key, feedback.value == null ? "" : String(feedback.value))
  }, [setVitalCell, cvpUnit])

  /** True when the cell's own draft (not yet committed) still fails validation. */
  const hasBlockingDraft = useCallback((col: number, key: VitalKey) => {
    const draft = vitalDrafts[`${col}-${key}`]
    return draft !== undefined && evaluateVitalInput(
      key as IntraopVitalKey,
      draft,
      key === "cvp" ? cvpUnit : "mmHg",
    ).error
  }, [vitalDrafts, cvpUnit])

  return { vitalDrafts, activeVitalCell, setActiveVitalCell, setVital, hasBlockingDraft }
}
