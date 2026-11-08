import React, { useCallback, useEffect, useRef, useState } from "react"
import { intraopTabForFocus, type IntraopTab } from "@/lib/intraop-tabs"
import { recordIntraopTabTiming, takeRenderPhases } from "@/lib/diagnostics"

/**
 * The open Intraop tab, and the time from the tap to the committed render of the
 * new tab: the number the clinician actually experiences, readable later on the
 * diagnostics screen.
 */
export function useIntraopTabTiming(focus: string | undefined, pendingSaves: () => number) {
  const [tab, setTab] = useState<IntraopTab>(() => intraopTabForFocus(focus) ?? "timing")
  const tabSwitchStartedAt = useRef<number | null>(null)
  const tabRenderStartedAt = useRef<number | null>(null)
  // Read when the tab changes, never a reason to re-run the effect.
  const pendingSavesRef = useRef(pendingSaves)
  useEffect(() => { pendingSavesRef.current = pendingSaves })
  const selectTab = useCallback((next: React.SetStateAction<IntraopTab>) => {
    tabSwitchStartedAt.current = Date.now()
    tabRenderStartedAt.current = null
    setTab(next)
  }, [])
  // Marks the start of the render that shows the new tab. The gap between the
  // tap and this point is time React never got — the JS thread was busy with
  // something else, which is a different problem from a slow render.
  if (tabSwitchStartedAt.current !== null && tabRenderStartedAt.current === null) {
    tabRenderStartedAt.current = Date.now()
  }
  useEffect(() => {
    const startedAt = tabSwitchStartedAt.current
    if (startedAt == null) return
    const renderStartedAt = tabRenderStartedAt.current ?? startedAt
    tabSwitchStartedAt.current = null
    tabRenderStartedAt.current = null
    const now = Date.now()
    recordIntraopTabTiming(now - startedAt, {
      tab,
      blockedMs: renderStartedAt - startedAt,
      renderMs: now - renderStartedAt,
      pendingSaves: pendingSavesRef.current(),
      renderPhases: takeRenderPhases(),
    })
  }, [tab])
  return { tab, selectTab }
}
