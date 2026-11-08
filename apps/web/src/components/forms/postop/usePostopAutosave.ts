import { useEffect, useRef } from "react"
import { useWatch, type Control, type FieldValues, type UseFormGetValues } from "react-hook-form"
import { useLatestRef } from "@/hooks/useLatestRef"

/**
 * Debounced auto-save of the postop form. It skips the first run: this effect fires on mount, so without the guard
 * simply opening the form scheduled a save of whatever the defaults happened to be. Autosave should record what the
 * clinician entered, never the act of looking.
 *
 * The callback arrives as a new arrow on every render of the page. The timer reads the newest one when it fires, and
 * the effect restarts only for a change to the form or for autosave turning on or off, so a re-render of the page no
 * longer saves again a moment later (11.0).
 */
export function usePostopAutosave<T extends FieldValues>({ control, getValues, onAutoSave }: {
  control: Control<T>
  getValues: UseFormGetValues<T>
  onAutoSave?: (data: T) => void
}) {
  const allValuesKey = JSON.stringify(useWatch({ control }))
  const mountedRef = useRef(false)
  const onAutoSaveRef = useLatestRef(onAutoSave)
  const autosaveEnabled = Boolean(onAutoSave)
  useEffect(() => {
    if (!autosaveEnabled) return
    if (!mountedRef.current) { mountedRef.current = true; return }
    const timer = setTimeout(() => onAutoSaveRef.current?.(getValues()), 1500)
    return () => clearTimeout(timer)
  }, [allValuesKey, autosaveEnabled, getValues, onAutoSaveRef])
}
