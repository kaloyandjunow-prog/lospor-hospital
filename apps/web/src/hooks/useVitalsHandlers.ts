import { useCallback } from "react"
import type { RefObject } from "react"
import type { TimetableData, VitalsEntry } from "@/components/IntraopTimetable"

// Takes refs (not data/onChange directly) because setVital/lastVitalBefore
// are wrapped in useCallback with empty deps in the original code — they
// need the *current* data on every call without becoming a new function on
// every render (this matters for vitals specifically because the clock-tick
// auto-extend effect and rapid-fire stepper input both call these often).
export function useVitalsHandlers(
  dataRef: RefObject<TimetableData>,
  rawOnChangeRef: RefObject<(d: TimetableData) => void>,
) {
  const setVital = useCallback((col: number, key: keyof VitalsEntry, raw: string) => {
    const val  = raw === "" ? undefined : Number(raw)
    const next = [...dataRef.current.vitals]
    while (next.length <= col) next.push({})
    next[col] = { ...next[col], [key]: val }
    rawOnChangeRef.current({ ...dataRef.current, vitals: next })
  // dataRef and rawOnChangeRef are stable refs — no deps needed
  }, [dataRef, rawOnChangeRef])

  const lastVitalBefore = useCallback((col: number, key: keyof VitalsEntry): number | undefined => {
    for (let c = col - 1; c >= 0; c--) {
      const v = dataRef.current.vitals[c]?.[key]
      if (v != null) return v
    }
    return undefined
  }, [dataRef])

  return { setVital, lastVitalBefore }
}
