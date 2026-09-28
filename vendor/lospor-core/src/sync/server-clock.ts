// "Now" from the server's clock (9.13.0).
//
// Whether an entry is planned or given, which row "now" is, and when an entry
// was made are all decided against "now". A phone whose clock runs ten
// minutes slow would call a stop planned that the server has already applied.
// This clock measures how far the device is from the server, from the time
// the API stamps on its responses, and corrects "now" by that much.
//
// Only "now" is corrected -- never a time a clinician entered: a picked 15:22
// is converted in the case's time zone exactly as before and is never moved.
// And the offset is a difference of two instants in milliseconds: no time of
// day is parsed and no time zone takes part, so a server hosted at GMT+1
// cannot shift anything.

/** The response header carrying the server's clock, in epoch milliseconds. */
export const SERVER_TIME_HEADER = "x-lospor-server-time"

/** A sample older than this is replaced by the next one, so the clock follows drift. */
const SAMPLE_LIFETIME_MS = 10 * 60_000
/** A round trip longer than this measures the network, not the clock. */
const MAX_ROUND_TRIP_MS = 10_000

export type ServerClock = ReturnType<typeof createServerClock>

export function createServerClock(deviceNow: () => number = () => Date.now()) {
  let offset = 0
  let best: { roundTrip: number; at: number } | null = null

  return {
    /**
     * One response: when the request left, when the answer came back (both
     * device time) and what the server's clock said. The sample with the
     * shortest round trip is the most accurate and is kept; a stale one is
     * replaced by whatever comes next.
     */
    observe(serverMs: number, sentAt: number, receivedAt: number): void {
      const roundTrip = receivedAt - sentAt
      if (!Number.isFinite(serverMs) || roundTrip < 0 || roundTrip > MAX_ROUND_TRIP_MS) return
      const stale = best == null || receivedAt - best.at > SAMPLE_LIFETIME_MS
      if (!stale && roundTrip > best!.roundTrip) return
      offset = serverMs - (sentAt + roundTrip / 2)
      best = { roundTrip, at: receivedAt }
    },
    /** Server-corrected now. */
    now(): Date {
      return new Date(deviceNow() + offset)
    },
    nowMs(): number {
      return deviceNow() + offset
    },
    offsetMs(): number {
      return offset
    },
  }
}

/** The server's clock from a response's headers, or null when absent or unreadable. */
export function readServerTime(headers: { get(name: string): string | null }): number | null {
  const raw = headers.get(SERVER_TIME_HEADER)
  if (!raw || !/^\d{10,16}$/.test(raw.trim())) return null
  return Number(raw.trim())
}
