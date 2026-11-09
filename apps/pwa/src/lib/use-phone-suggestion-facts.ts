import { useMemo } from "react"
import type { usePhoneAirwayExchange } from "@/lib/use-phone-airway-exchange"
import type { LabResult } from "@lospor/core/labs"
import type { TechniqueSide } from "@lospor/core/technique-smart"

type LabRow = LabResult

/** The facts the suggestion engine reads from this screen's state, rebuilt only when one of them changes. */
export function usePhoneSuggestionFacts({ caseIbw, monitoring, labResults, bloodLossMl, startedAtIso, endedAtIso, caseTimezone, techniques, techniqueSides, awDevices, airwayExchange, awPresentsIntubated }: {
  caseIbw: number | null | undefined
  monitoring: string[]
  labResults: LabRow[]
  bloodLossMl: string | number | null
  startedAtIso: string | null
  endedAtIso: string | null
  caseTimezone: string | null
  techniques: string[]
  techniqueSides: Record<string, TechniqueSide>
  awDevices: string[]
  airwayExchange: ReturnType<typeof usePhoneAirwayExchange>
  awPresentsIntubated: boolean
}) {
  return useMemo(() => ({
    idealWeightKg: caseIbw ?? null,
    tofMonitor: monitoring.includes("tofMonitor"),
    labs: labResults.map(lab => ({ ...lab, unit: lab.unit ?? "" })),
    bloodLossMl: Number(bloodLossMl) > 0 ? Number(bloodLossMl) : null,
    startedAt: startedAtIso,
    endedAt: endedAtIso,
    timeZone: caseTimezone ?? null,
    techniques,
    techniqueSides,
    airwayDevices: awDevices,
    airwayDeviceEntries: airwayExchange.entries(),
    presentsIntubated: awPresentsIntubated,
  }), [caseIbw, monitoring, labResults, bloodLossMl, startedAtIso, endedAtIso, caseTimezone, techniques, techniqueSides, awDevices, airwayExchange, awPresentsIntubated])
}
