import { useMemo } from "react"
import { useWatch, type Control } from "react-hook-form"
import { useSuggestionContext } from "@/lib/use-intraop-automation"
import type { PreopSummary } from "@/components/forms/preop-summary"
import type { IntraopFormFields } from "../intraopSchema"

/**
 * The facts the suggestion engine reads from the form (technique, airway, labs,
 * times), and the context built from them. Also returns the watched technique
 * list, which the chart and the airway section need too.
 */
export function useIntraopSuggestionContext({ control, preop, readOnly, idealWeightKg, startedAt, endedAt, timeZone }: {
  control: Control<IntraopFormFields>
  preop?: PreopSummary | null
  readOnly: boolean
  idealWeightKg: number | null
  startedAt: string | null | undefined
  endedAt: string | null | undefined
  timeZone: string | null | undefined
}) {
  const [tofMonitor, bloodLossMl, labs] = useWatch({ control, name: ["tofMonitor", "bloodLossMl", "labResults"] })
  const [watchedTechniques, techniqueSides, airwayDevices, airwayDeviceEntries, presentsIntubated] = useWatch({
    control, name: ["techniques", "techniqueSides", "airwayDevices", "airwayDeviceEntries", "presentsIntubated"],
  })
  const facts = useMemo(() => ({
    idealWeightKg, tofMonitor, bloodLossMl,
    labs: (labs ?? []).map(lab => ({ ...lab, unit: lab.unit ?? "" })),
    startedAt: startedAt ?? null, endedAt: endedAt ?? null,
    timeZone: timeZone ?? null,
    techniques: (watchedTechniques ?? []) as string[],
    techniqueSides: (techniqueSides ?? {}) as Record<string, "LEFT" | "RIGHT" | "BOTH">,
    airwayDevices: (airwayDevices ?? []) as string[],
    airwayDeviceEntries: (airwayDeviceEntries ?? []) as Record<string, unknown>[],
    presentsIntubated: presentsIntubated === true,
  }), [idealWeightKg, tofMonitor, labs, bloodLossMl, startedAt, endedAt, timeZone, watchedTechniques, techniqueSides, airwayDevices, airwayDeviceEntries, presentsIntubated])
  const suggestionContext = useSuggestionContext(preop, facts, readOnly)
  return { suggestionContext, watchedTechniques }
}
