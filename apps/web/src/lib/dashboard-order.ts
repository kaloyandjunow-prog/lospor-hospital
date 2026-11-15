import { calendarDayKey, DASHBOARD_TIMEZONE } from "@lospor/core/dashboard-date-scope"
import { shiftDateKey } from "@lospor/core/intraop-time"

/**
 * How the dashboard lays its cases out (hospital 1.9.2): the clinician's own
 * cases first, then by day, then by operating theatre, then by where each case
 * stands.
 *
 * - Own: the cases this clinician holds now (theirs from the start, or accepted
 *   from a colleague). A case they created and handed on is the colleague's.
 * - Day: the day anaesthesia started, or the day the case was created if it has
 *   not. A case still under anaesthesia belongs to today, even one that started
 *   before midnight.
 * - Theatre: in the site's own order, cases without a theatre last. Only while
 *   the site uses theatres and the list is not already filtered to one.
 * - Within that: anaesthesia running (earliest start first), anaesthesia over
 *   but the case not closed (longest waiting first), not started yet (oldest
 *   first), then closed cases (latest first).
 *
 * The same module lives in apps/web and apps/pwa; keep them identical.
 */

type Instant = Date | string | null | undefined

export type DashboardOrderCase = {
  id: string
  status: string
  userId?: string
  createdAt: Date | string
  theatre?: { id: string | null; name: string | null } | null
  intraop?: { startedAt?: Instant; endedAt?: Instant; endTime?: Instant } | null
}

export type DashboardTheatreGroup<T> = { theatreId: string | null; name: string | null; cases: T[] }
export type DashboardDayGroup<T> = { dayKey: string; theatres: DashboardTheatreGroup<T>[] }
/** `mine` is null when the list was not split by owner. */
export type DashboardOwnerSection<T> = { mine: boolean | null; days: DashboardDayGroup<T>[] }

function time(value: Instant): number | null {
  if (value == null || value === "") return null
  const ms = (value instanceof Date ? value : new Date(value)).getTime()
  return Number.isFinite(ms) ? ms : null
}

function closed(c: DashboardOrderCase): boolean {
  return c.status === "COMPLETE" || c.status === "CANCELLED"
}

function anaesthesiaEnded(c: DashboardOrderCase): boolean {
  return time(c.intraop?.endedAt) != null || time(c.intraop?.endTime) != null
}

/** Anaesthesia has started and not ended, on a case that is still open: the green light. */
export function anaesthesiaRunning(c: DashboardOrderCase): boolean {
  return !closed(c) && time(c.intraop?.startedAt) != null && !anaesthesiaEnded(c)
}

/** The Europe/Sofia day a case is listed under. */
export function dashboardCaseDay(c: DashboardOrderCase, now: Date = new Date()): string {
  if (anaesthesiaRunning(c)) return calendarDayKey(now, DASHBOARD_TIMEZONE)
  const at = time(c.intraop?.startedAt) ?? time(c.createdAt) ?? now.getTime()
  return calendarDayKey(new Date(at), DASHBOARD_TIMEZONE)
}

/** "Today" on the dashboard: created today, or anaesthesia started today (the server counts the same). */
export function isTodaysCase(c: DashboardOrderCase, now: Date = new Date()): boolean {
  const today = calendarDayKey(now, DASHBOARD_TIMEZONE)
  const created = time(c.createdAt)
  const started = time(c.intraop?.startedAt)
  return (created != null && calendarDayKey(new Date(created), DASHBOARD_TIMEZONE) === today)
    || (started != null && calendarDayKey(new Date(started), DASHBOARD_TIMEZONE) === today)
}

function stage(c: DashboardOrderCase): 0 | 1 | 2 | 3 {
  if (closed(c)) return 3
  if (anaesthesiaRunning(c)) return 0
  if (anaesthesiaEnded(c) || c.status === "AWAITING_REVIEW") return 1
  return 2
}

function stageTime(c: DashboardOrderCase, s: number): number {
  const created = time(c.createdAt) ?? 0
  if (s === 0) return time(c.intraop?.startedAt) ?? created
  if (s === 1) return time(c.intraop?.endedAt) ?? time(c.intraop?.startedAt) ?? created
  if (s === 2) return created
  // Closed: latest first.
  return -(time(c.intraop?.endedAt) ?? time(c.intraop?.startedAt) ?? created)
}

/** Running, then waiting to be closed, then not started, then closed. */
export function compareDashboardCases(a: DashboardOrderCase, b: DashboardOrderCase): number {
  const sa = stage(a)
  const sb = stage(b)
  if (sa !== sb) return sa - sb
  return stageTime(a, sa) - stageTime(b, sb) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

export function groupDashboardCases<T extends DashboardOrderCase>(
  cases: T[],
  options: {
    now?: Date
    /** The site's theatres in their own order; null when the site does not use them or the list is filtered to one. */
    theatres?: { id: string; name: string }[] | null
    /** False puts every case in one group (the "Today" list is one day already). */
    byDay?: boolean
  } = {},
): DashboardDayGroup<T>[] {
  const now = options.now ?? new Date()
  const byDay = new Map<string, T[]>()
  for (const c of cases) {
    const day = options.byDay === false ? calendarDayKey(now, DASHBOARD_TIMEZONE) : dashboardCaseDay(c, now)
    const list = byDay.get(day)
    if (list) list.push(c)
    else byDay.set(day, [c])
  }
  const theatreOrder = new Map((options.theatres ?? []).map((theatre, index) => [theatre.id, index]))
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([dayKey, dayCases]) => {
      const sorted = [...dayCases].sort(compareDashboardCases)
      if (!options.theatres) return { dayKey, theatres: [{ theatreId: null, name: null, cases: sorted }] }
      const groups = new Map<string, DashboardTheatreGroup<T>>()
      for (const c of sorted) {
        const id = c.theatre?.id ?? null
        const key = id ?? ""
        const group = groups.get(key)
        if (group) group.cases.push(c)
        else groups.set(key, { theatreId: id, name: c.theatre?.name ?? null, cases: [c] })
      }
      const rank = (g: DashboardTheatreGroup<T>) =>
        g.theatreId == null ? Number.MAX_SAFE_INTEGER : theatreOrder.get(g.theatreId) ?? Number.MAX_SAFE_INTEGER - 1
      return {
        dayKey,
        theatres: [...groups.values()].sort((a, b) => rank(a) - rank(b) || (a.name ?? "").localeCompare(b.name ?? "")),
      }
    })
}

/**
 * The clinician's own cases above everyone else's, each laid out by
 * `groupDashboardCases`. Sections with no cases are left out.
 */
export function dashboardSections<T extends DashboardOrderCase>(
  cases: T[],
  options: Parameters<typeof groupDashboardCases>[1] & { ownerId?: string } = {},
): DashboardOwnerSection<T>[] {
  const { ownerId, ...layout } = options
  if (!ownerId) return [{ mine: null, days: groupDashboardCases(cases, layout) }]
  const mine = cases.filter(c => c.userId === ownerId)
  const others = cases.filter(c => c.userId !== ownerId)
  return [
    ...(mine.length ? [{ mine: true, days: groupDashboardCases(mine, layout) }] : []),
    ...(others.length ? [{ mine: false, days: groupDashboardCases(others, layout) }] : []),
  ]
}

/** "08:42" in the department's clock. */
export function departmentClock(value: Instant): string | null {
  const ms = time(value)
  if (ms == null) return null
  return new Intl.DateTimeFormat("en-GB", { timeZone: DASHBOARD_TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms))
}

/** "Днес", "Вчера", or the date, for a day heading. */
export function dashboardDayLabel(dayKey: string, language: "bg" | "en", now: Date = new Date()): string {
  const today = calendarDayKey(now, DASHBOARD_TIMEZONE)
  const yesterday = shiftDateKey(today, -1)
  if (dayKey === today) return language === "bg" ? "Днес" : "Today"
  if (dayKey === yesterday) return language === "bg" ? "Вчера" : "Yesterday"
  const [y, m, d] = dayKey.split("-").map(Number)
  return new Intl.DateTimeFormat(language === "bg" ? "bg-BG" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d, 12)))
}
