import { useSyncExternalStore } from "react"
import { defibrillationPrefillJoules, defibrillationShockNumber } from "@lospor/core/defibrillation"
import { preopAgeDays } from "@lospor/core/vital-questions"
import { defibrillationSheet } from "@/lib/defibrillation-knob"
import { formatTs } from "@/lib/intraop-format"
import type { IntraopPreopSummary } from "@/lib/intraop-preop-summary"
import type { SaveIntraopEvent } from "@/lib/intraop-stamp"
import type { LogEvent } from "@/lib/intraop-log-event"
import { DefibrillationSheet } from "./DefibrillationSheet"

/**
 * The Defibrillation sheet, opened from the slot sheet at the slot's time
 * (10.1.0). Rendered beside the screen rather than threaded through its props:
 * it needs only the log, the save path and the patient's age and weight.
 */
export function DefibrillationHost({ log, save, preop }: {
  log: LogEvent[]
  save: SaveIntraopEvent
  preop: IntraopPreopSummary | null
}) {
  const ts = useSyncExternalStore(defibrillationSheet.subscribe, defibrillationSheet.current, defibrillationSheet.current)
  if (!ts) return null
  const shockNumber = defibrillationShockNumber(log, ts)
  const ageDays = preopAgeDays(preop ? { ageValue: preop.ageValue, ageUnit: preop.ageUnit, ageYears: preop.age, ageApproxDays: preop.ageApproxDays } : null)
  const prefillJoules = defibrillationPrefillJoules({ ageDays, weightKg: preop?.weight, shockNumber })
  return (
    <DefibrillationSheet
      key={ts}
      visible
      timeLabel={formatTs(ts)}
      shockNumber={shockNumber}
      prefillJoules={prefillJoules}
      onClose={() => defibrillationSheet.close()}
      onSave={(energyJ, synchronized) => {
        void save({ type: "defibrillation", label: synchronized ? "Cardioversion" : "Defibrillation", color: "#f59e0b", energyJ, synchronized }, ts)
        defibrillationSheet.close()
      }}
    />
  )
}
