import { useEffect, useRef, type MutableRefObject } from "react"
import { useWatch, type Control, type UseFormGetValues } from "react-hook-form"
import { AIRWAY_RECORD_PATCH_KEYS } from "@lospor/core/airway-smart"
import { useLatestRef } from "@/hooks/useLatestRef"
import type { IntraopData, IntraopFormFields } from "../intraopSchema"

/**
 * Debounced auto-save. It skips the initial mount so loading a case never
 * overwrites the database with form defaults, and it flushes the latest
 * snapshot when the screen is left. Returns the watched ventilation modes,
 * which the chart also needs.
 */
export function useIntraopAutosave({ control, getValues, onAutoSave, atomicAirwayEventPendingRef, atomicVascularEventPendingRef }: {
  control: Control<IntraopFormFields>
  getValues: UseFormGetValues<IntraopFormFields>
  onAutoSave?: (data: IntraopData) => void
  /** A structured airway/vascular action already persists its form patch and event atomically; the next snapshot leaves it out once. */
  atomicAirwayEventPendingRef: MutableRefObject<boolean>
  atomicVascularEventPendingRef: MutableRefObject<boolean>
}) {
  const mountedRef = useRef(false)
  // The callback arrives as a new arrow on every render of the page. The timer reads the newest one when it fires
  // and the effect depends only on whether there is one, so a re-render no longer restarts the save (11.0).
  const onAutoSaveRef = useLatestRef(onAutoSave)
  const autosaveEnabled = Boolean(onAutoSave)
  // Keep a ref to the latest save function so the unmount effect can call it
  const pendingSaveRef = useRef<(() => void) | null>(null)

  const allValues = useWatch({ control })
  // Watch array fields explicitly so their changes always trigger auto-save
  const airwayDevices = useWatch({ control, name: "airwayDevices" })
  const ventilationModes = useWatch({ control, name: "ventilationModes" })
  const airwayTools = useWatch({ control, name: "airwayTools" })
  const positions = useWatch({ control, name: "positions" })
  const allValuesKey = JSON.stringify(allValues)
  const airwayDevicesKey = JSON.stringify(airwayDevices)
  const ventilationModesKey = JSON.stringify(ventilationModes)
  const airwayToolsKey = JSON.stringify(airwayTools)
  const positionsKey = JSON.stringify(positions)

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    if (!autosaveEnabled) return
    // A structured airway/vascular action carries its record and clinical
    // event through one idempotent event operation. Do not replay those fields
    // through the slower form PATCH path, but keep saving everything else: a
    // note or setting changed in the same second must not be dropped.
    const payload: Record<string, unknown> = { ...getValues() }
    if (atomicAirwayEventPendingRef.current) {
      for (const key of AIRWAY_RECORD_PATCH_KEYS) delete payload[key]
      atomicAirwayEventPendingRef.current = false
    }
    if (atomicVascularEventPendingRef.current) {
      delete payload.vascularAccesses
      atomicVascularEventPendingRef.current = false
    }
    const save = () => onAutoSaveRef.current?.(payload as IntraopData)
    pendingSaveRef.current = save                    // always keep latest snapshot
    const timer = setTimeout(save, 1000)
    return () => clearTimeout(timer)
  }, [airwayDevicesKey, airwayToolsKey, allValuesKey, atomicAirwayEventPendingRef, atomicVascularEventPendingRef, autosaveEnabled, getValues, onAutoSaveRef, positionsKey, ventilationModesKey])

  // Fire pending save immediately when user navigates away (component unmounts)
  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) pendingSaveRef.current()
    }
  }, [])
  return { ventilationModes }
}
