/**
 * "Today" and "this month" for the case dashboards, in one timezone.
 *
 * Web computed these in whatever timezone the server process happened to be
 * running in (commonly UTC in a container); mobile computed them in the
 * phone's own local timezone. Near local midnight the two disagreed about
 * which day a case fell on. LOSPOR is a Bulgarian register with no
 * institution-timezone setting yet, so Europe/Sofia is the one zone both the
 * server and every client resolve these boundaries in, rather than each
 * asking its own runtime what "now" means.
 */
export const DASHBOARD_TIMEZONE = "Europe/Sofia"

/** "YYYY-MM-DD" for `date`, as read in `timeZone` -- a sortable, comparable day key. */
export function calendarDayKey(date: Date, timeZone: string = DASHBOARD_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

/** "YYYY-MM" for `date`, as read in `timeZone`. */
export function calendarMonthKey(date: Date, timeZone: string = DASHBOARD_TIMEZONE): string {
  return calendarDayKey(date, timeZone).slice(0, 7)
}

export function isSameCalendarDay(a: Date, b: Date, timeZone: string = DASHBOARD_TIMEZONE): boolean {
  return calendarDayKey(a, timeZone) === calendarDayKey(b, timeZone)
}

export function isSameCalendarMonth(a: Date, b: Date, timeZone: string = DASHBOARD_TIMEZONE): boolean {
  return calendarMonthKey(a, timeZone) === calendarMonthKey(b, timeZone)
}
