import { useEffect, useRef } from "react"
import { procedurePrefillEnabled } from "@lospor/core/intraop-suggestions"
import { useAutomationPreferences, useIntraopAutomation } from "@/lib/use-intraop-automation"

/**
 * The postoperative "Procedure done" starts as the planned procedure (10.0.0) unless Status, or the clinician,
 * switched that off (10.3.0). It waits for the policy to load before filling the field in, once, so a switched-off
 * line is never overtaken by the fill, and it never replaces what is already saved.
 */
export function usePostopProcedurePrefill({ getValues, setValue, plannedProcedures }: {
  getValues: (name: "performedProcedures") => unknown
  setValue: (name: "performedProcedures", value: never, options: { shouldDirty: boolean }) => void
  plannedProcedures: unknown[]
}) {
  const { settings, ready } = useIntraopAutomation()
  const { user } = useAutomationPreferences()
  const done = useRef(false)
  useEffect(() => {
    if (!ready || done.current) return
    done.current = true
    const saved = getValues("performedProcedures")
    if (!procedurePrefillEnabled(settings, user) || !plannedProcedures.length || (Array.isArray(saved) && saved.length > 0)) return
    setValue("performedProcedures", plannedProcedures as never, { shouldDirty: true })
  }, [settings, ready, user, getValues, plannedProcedures, setValue])
}
