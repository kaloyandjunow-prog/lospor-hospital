import { useCallback, useEffect, useRef, useState } from "react"
import * as Haptics from "expo-haptics"
import { notify } from "@/lib/notify"
import type { IntraopTab } from "@/lib/intraop-tabs"
import { usePreferences } from "@/lib/preferences-context"

type PatchIntraopSection = (payload: Record<string, unknown>) => Promise<unknown>

type FluidStatusFields = {
  urineMl: number | null
  bloodLossMl: number | null
}

const EMPTY: FluidStatusFields = { urineMl: null, bloodLossMl: null }

/**
 * The two fluid-status figures a clinician types. Everything else on the tab
 * — infusion, bolus and fluid totals — is a projection of the timetable and is
 * never written from here.
 *
 * They save when the tab is left, the same way premedication does, so numbers
 * entered mid-case survive a swipe back to the timetable.
 *
 * The numeric fields send `null` when cleared, never `undefined`: an undefined
 * key is dropped from the patch as "not mentioned", so the previous figure
 * would silently stand. "Not recorded" and a recorded 0 mL are different
 * clinical statements and both have to survive the round trip.
 */
export function useIntraopFluidStatus(
  tab: IntraopTab,
  patchIntraopSection: PatchIntraopSection,
  errorLabel: string,
) {
  const { tc } = usePreferences()
  const [fields, setFields] = useState<FluidStatusFields>(EMPTY)
  const [fluidStatusSaving, setFluidStatusSaving] = useState(false)
  const prevTabRef = useRef<IntraopTab>("equipment")
  const saveRef = useRef<() => Promise<void>>(async () => {})
  // What the server is known to hold, so leaving the tab untouched issues no
  // write. `null` means "not loaded yet" and is distinct from a loaded record
  // whose figures are themselves null.
  const lastSavedRef = useRef<FluidStatusFields | null>(null)

  /** Adopt the stored figures without marking them dirty. */
  const hydrateFluidStatus = useCallback((stored: Partial<FluidStatusFields>) => {
    const next: FluidStatusFields = {
      urineMl: stored.urineMl ?? null,
      bloodLossMl: stored.bloodLossMl ?? null,
    }
    setFields(next)
    lastSavedRef.current = next
  }, [])

  const setUrineMl = useCallback((value: number | null) => {
    setFields(previous => ({ ...previous, urineMl: value }))
  }, [])
  const setBloodLossMl = useCallback((value: number | null) => {
    setFields(previous => ({ ...previous, bloodLossMl: value }))
  }, [])

  async function saveFluidStatus() {
    const saved = lastSavedRef.current
    if (saved
      && saved.urineMl === fields.urineMl
      && saved.bloodLossMl === fields.bloodLossMl) return

    setFluidStatusSaving(true)
    try {
      await patchIntraopSection({
        urineMl: fields.urineMl,
        bloodLossMl: fields.bloodLossMl,
      })
      lastSavedRef.current = fields
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch {
      notify(errorLabel, tc("fluidStatusSaveFailed"))
    } finally {
      setFluidStatusSaving(false)
    }
  }

  saveRef.current = saveFluidStatus

  useEffect(() => {
    if (prevTabRef.current === "fluids" && tab !== "fluids") {
      void saveRef.current()
    }
    prevTabRef.current = tab
  }, [tab])

  return {
    urineMl: fields.urineMl,
    bloodLossMl: fields.bloodLossMl,
    setUrineMl,
    setBloodLossMl,
    hydrateFluidStatus,
    fluidStatusSaving,
    saveFluidStatus,
  }
}
