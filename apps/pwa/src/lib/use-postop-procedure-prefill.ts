import { useEffect, useRef } from "react"
import { procedurePrefillEnabled } from "@lospor/core/intraop-suggestions"
import { usePreferences } from "@/lib/preferences-context"
import { useIntraopAutomation } from "@/lib/use-intraop-automation"

/**
 * The postoperative "Procedure done" starts as the planned procedure (10.0.0) unless Status, or the clinician,
 * switched that off (10.3.0). Once the case has loaded and the policy with it, the planned procedure is filled in a
 * single time, and never over what is already saved. A policy that has not loaded yet is waited for, not read as off.
 */
export function usePostopProcedurePrefill({ loading, plannedProcedures, getValues, setValue }: {
  loading: boolean
  /** The planned procedures to fill in; null when the record already has its own or none was planned. */
  plannedProcedures: unknown[] | null
  getValues: (name: "performedProcedures") => unknown
  setValue: (name: "performedProcedures", value: never, options: { shouldDirty: boolean }) => void
}) {
  const { settings, ready } = useIntraopAutomation()
  const { automationGroups, automationLines } = usePreferences()
  const done = useRef(false)
  useEffect(() => {
    if (loading || !ready || !plannedProcedures || done.current) return
    done.current = true
    const saved = getValues("performedProcedures")
    if (!procedurePrefillEnabled(settings, { ...automationGroups, automationLines }) || (Array.isArray(saved) && saved.length > 0)) return
    setValue("performedProcedures", plannedProcedures as never, { shouldDirty: true })
  }, [settings, automationGroups, automationLines, ready, getValues, loading, plannedProcedures, setValue])
}
