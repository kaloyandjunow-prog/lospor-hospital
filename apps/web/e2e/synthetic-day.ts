/**
 * The day the cross-app specs chart on. It is yesterday in Sofia, never a fixed date: the web
 * timeline takes "now" from the server's clock (9.13.0), so a case that starts months before the
 * run is drawn column by column up to today, and the page grows to gigabytes. A recent day keeps
 * the chart to a day or two, and the wall-clock labels the specs read (09:00 and so on) stay the
 * same because every time below is given as Sofia time, whatever the offset that day.
 */
const ZONE = "Europe/Sofia"

function offsetMinutes(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms))
  const get = (type: string) => Number(parts.find(part => part.type === type)!.value)
  return (Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - ms) / 60_000
}

export const SYNTHETIC_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(Date.now() - 24 * 3600_000))
export const SYNTHETIC_MONTH = SYNTHETIC_DAY.slice(0, 7)

/** A Sofia wall-clock time on the synthetic day, as an instant. */
export function sofia(hour: number, minute: number, second = 0): Date {
  const [year, month, day] = SYNTHETIC_DAY.split("-").map(Number)
  const guess = Date.UTC(year, month - 1, day, hour, minute, second)
  let instant = guess - offsetMinutes(guess) * 60_000
  const corrected = guess - offsetMinutes(instant) * 60_000
  if (corrected !== instant) instant = corrected
  return new Date(instant)
}

export const sofiaIso = (hour: number, minute: number, second = 0): string => sofia(hour, minute, second).toISOString()
