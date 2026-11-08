import { useEffect, useState } from "react"
import type { TimetableData } from "@/components/IntraopTimetable"
import { infusionsVolumeMl, tciPatientFrom } from "@/lib/intraop-drug-totals"
import { fluidDeliveredVolumeMl } from "@/lib/fluid-entry-ui"

export type LiveFluidTotals = Partial<Record<"crystalloidsMl" | "colloidsMl" | "bloodMl" | "infusionsMl", number | null>>

const TOTAL_KEYS = ["crystalloidsMl", "colloidsMl", "bloodMl", "infusionsMl"] as const
function sameTotals(a: LiveFluidTotals, b: LiveFluidTotals): boolean {
  return TOTAL_KEYS.every(key => (a[key] ?? null) === (b[key] ?? null))
}

/**
 * Auto-calculated fluid totals from the one canonical delivered-volume path.
 * Running rate entries advance against the real clock; bag entries retain
 * their selected size until a full/partial actual amount is confirmed.
 */
export function useLiveFluidTotals(timetable: TimetableData, preop: Parameters<typeof tciPatientFrom>[0] | null | undefined): LiveFluidTotals | null {
  const [totals, setTotals] = useState<LiveFluidTotals | null>(null)
  useEffect(() => {
    function updateFluidTotals() {
      const asOf = new Date()
      let crystalloids = 0, colloids = 0, blood = 0
      for (const fluid of timetable.fluids ?? []) {
        const volume = fluidDeliveredVolumeMl(fluid, asOf)
        if (!volume) continue
        const category = fluid.category ?? ""
        if (category === "Crystalloids") crystalloids += volume
        else if (category === "Colloids") colloids += volume
        else if (category === "Blood products") blood += volume
      }
      // These are derived display values. They must not enter the form state:
      // doing so makes the 30-second clock look like a clinician edit and
      // sends a full PATCH whose mapper intentionally ignores these columns.
      const next: LiveFluidTotals = {
        crystalloidsMl: crystalloids || null,
        colloidsMl: colloids || null,
        bloodMl: blood || null,
        infusionsMl: infusionsVolumeMl(timetable.infusions, asOf, tciPatientFrom(preop ?? {})) || null,
      }
      // The same totals keep the same object. A fresh object each time re-rendered the whole intraop form every
      // time the effect ran, and the effect runs again whenever the form re-renders with new arrays (11.0).
      setTotals(previous => (previous && sameTotals(previous, next) ? previous : next))
    }

    updateFluidTotals()
    const hasRunningRate = (timetable.fluids ?? []).some(
      fluid => fluid.fluidEntryMode === "RATE" && !fluid.stopped,
    ) || (timetable.infusions ?? []).some(infusion => !infusion.stopped && (infusion.volumeRateMlPerHour != null || !!infusion.tciModel))
    if (!hasRunningRate) return
    const timer = window.setInterval(updateFluidTotals, 30_000)
    return () => window.clearInterval(timer)
  }, [preop, timetable.fluids, timetable.infusions])
  return totals
}
