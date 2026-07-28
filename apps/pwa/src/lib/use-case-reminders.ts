import { useCallback, useEffect, useRef, useState } from "react"
import * as SecureStore from "expo-secure-store"
import { ensurePermission, scheduleRepeating, cancelReminder, type ReminderHandle } from "./notifications"

export const REMINDERS_KEY = "notif_case_reminders"
export const VITALS_INTERVAL_KEY = "notif_vitals_interval_min"
export const DEFAULT_INTERVAL_MIN = 5

// Manages the "record vitals" reminder for an active case. Reschedules whenever
// the case becomes active / the interval changes, and exposes noteVitals() so the
// caller can reset the countdown after charting a set of vitals.
export function useCaseReminders(active: boolean) {
  const [enabled, setEnabled] = useState(false)
  const [intervalMin, setIntervalMin] = useState(DEFAULT_INTERVAL_MIN)
  const handleRef = useRef<ReminderHandle>(null)

  useEffect(() => {
    SecureStore.getItemAsync(REMINDERS_KEY).then(v => setEnabled(v === "on")).catch(() => {})
    SecureStore.getItemAsync(VITALS_INTERVAL_KEY).then(v => {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) setIntervalMin(n)
    }).catch(() => {})
  }, [])

  const clear = useCallback(async () => {
    const h = handleRef.current
    handleRef.current = null
    if (h != null) await cancelReminder(h)
  }, [])

  const schedule = useCallback(async () => {
    await clear()
    if (!enabled || !active) return
    const ok = await ensurePermission()
    if (!ok) return
    handleRef.current = await scheduleRepeating(
      "Vitals due",
      `No vitals charted in ${intervalMin} min — tap to record.`,
      intervalMin,
    )
  }, [enabled, active, intervalMin, clear])

  // (Re)schedule when active/enabled/interval change; cancel on unmount.
  useEffect(() => {
    void schedule()
    return () => { void clear() }
  }, [schedule, clear])

  // Reset the countdown after vitals are recorded.
  const noteVitals = useCallback(() => { void schedule() }, [schedule])

  return { noteVitals, remindersEnabled: enabled }
}
