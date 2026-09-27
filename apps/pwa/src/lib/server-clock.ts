import { createServerClock } from "@lospor/core/sync"

/**
 * The app's one server-corrected clock (9.13.0). `apiFetch` feeds it from the
 * time the API stamps on every response; everything on the intraoperative
 * timeline that asks "what time is it" -- planned or given, the now row, when
 * an entry was made, start and end case -- asks this instead of the device.
 * A time the clinician picked is never passed through it.
 */
export const serverClock = createServerClock()

export function serverNow(): Date {
  return serverClock.now()
}
