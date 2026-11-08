import { sortIntraopEvents } from "@lospor/core/intraop-engine"
import type { LogEvent } from "@/lib/intraop-log-event"

/**
 * Jet ventilation on the phone (10.2.0): ticking Jet among the ventilation
 * modes puts a Jet button in each column's sheet; it opens the jet sheet at
 * that column's time. Like the shock sheet, one at a time, opened from the
 * slot sheet through this small store.
 */
type Listener = () => void
let openAt: string | null = null
let enabled = false
const listeners = new Set<Listener>()
const emit = () => listeners.forEach(listener => listener())

export const jetSheet = {
  open(ts: string) { openAt = ts; emit() },
  close() { openAt = null; emit() },
  current: () => openAt,
  /** Jet is ticked among the ventilation modes. */
  setEnabled(value: boolean) { if (enabled !== value) { enabled = value; emit() } },
  enabled: () => enabled,
  subscribe(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
}

export type JetSettings = { pressureBar: number; rate: number; fio2: number }

/** What first opens with; later runs open with the last settings. */
export const DEFAULT_JET_SETTINGS: JetSettings = { pressureBar: 2, rate: 150, fio2: 100 }

/** The jet running at an instant, with its settings, or null; and the last settings used. */
export function jetAt(log: readonly LogEvent[], at: string): { running: JetSettings | null; last: JetSettings | null } {
  let current: JetSettings | null = null
  let last: JetSettings | null = null
  const limit = Date.parse(at)
  for (const event of sortIntraopEvents(log as never) as LogEvent[]) {
    if (Date.parse(event.ts) > limit) break
    if (event.type === "jet_start" || event.type === "jet_change") {
      const base: JetSettings = current ?? last ?? DEFAULT_JET_SETTINGS
      current = {
        pressureBar: event.jetPressureBar ?? base.pressureBar,
        rate: event.jetRate ?? base.rate,
        fio2: event.fio2 ?? base.fio2,
      }
      last = current
    } else if (event.type === "jet_stop") {
      current = null
    }
  }
  return { running: current, last }
}
