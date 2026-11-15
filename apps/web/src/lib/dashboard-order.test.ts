import { describe, expect, it } from "vitest"
import {
  anaesthesiaRunning,
  dashboardCaseDay,
  dashboardDayLabel,
  departmentClock,
  groupDashboardCases,
  isTodaysCase,
  type DashboardOrderCase,
} from "./dashboard-order"

// 15 November 2026, 10:00 in Sofia (UTC+2).
const NOW = new Date("2026-11-15T08:00:00Z")

function kase(id: string, over: Partial<DashboardOrderCase> = {}): DashboardOrderCase {
  return { id, status: "DRAFT", createdAt: "2026-11-15T06:00:00Z", ...over }
}

const ids = (groups: ReturnType<typeof groupDashboardCases>) =>
  groups.map(day => [day.dayKey, day.theatres.map(t => [t.name, t.cases.map(c => c.id)])])

describe("the green light", () => {
  it("is on only while anaesthesia runs on an open case", () => {
    expect(anaesthesiaRunning(kase("a", { status: "IN_PROGRESS", intraop: { startedAt: "2026-11-15T06:40:00Z" } }))).toBe(true)
    expect(anaesthesiaRunning(kase("b", { status: "IN_PROGRESS", intraop: { startedAt: "2026-11-15T06:40:00Z", endedAt: "2026-11-15T07:40:00Z" } }))).toBe(false)
    // Older records carry only the legacy end clock.
    expect(anaesthesiaRunning(kase("c", { status: "IN_PROGRESS", intraop: { startedAt: "2026-11-15T06:40:00Z", endTime: "2000-01-01T09:40:00Z" } }))).toBe(false)
    expect(anaesthesiaRunning(kase("d", { status: "DRAFT" }))).toBe(false)
    expect(anaesthesiaRunning(kase("e", { status: "COMPLETE", intraop: { startedAt: "2026-11-15T06:40:00Z" } }))).toBe(false)
  })
})

describe("today", () => {
  it("is created today or anaesthesia started today, by the Sofia calendar", () => {
    expect(isTodaysCase(kase("a"), NOW)).toBe(true)
    // Assessed yesterday, operated on this morning.
    expect(isTodaysCase(kase("b", { createdAt: "2026-11-14T15:00:00Z", intraop: { startedAt: "2026-11-15T06:00:00Z" } }), NOW)).toBe(true)
    // 23:30 on 14 November in Sofia is still the 14th.
    expect(isTodaysCase(kase("c", { createdAt: "2026-11-14T21:30:00Z" }), NOW)).toBe(false)
    // 00:30 on the 15th in Sofia is the 14th in UTC.
    expect(isTodaysCase(kase("d", { createdAt: "2026-11-14T22:30:00Z" }), NOW)).toBe(true)
  })

  it("keeps a case still under anaesthesia since last night in today's list", () => {
    const overnight = kase("a", { status: "IN_PROGRESS", createdAt: "2026-11-14T19:00:00Z", intraop: { startedAt: "2026-11-14T21:30:00Z" } })
    expect(dashboardCaseDay(overnight, NOW)).toBe("2026-11-15")
  })
})

describe("grouping and order", () => {
  const cases = [
    kase("closed-early", { status: "COMPLETE", intraop: { startedAt: "2026-11-15T05:00:00Z", endedAt: "2026-11-15T05:30:00Z" } }),
    kase("closed-late", { status: "COMPLETE", intraop: { startedAt: "2026-11-15T06:00:00Z", endedAt: "2026-11-15T06:30:00Z" } }),
    kase("not-started-new", { createdAt: "2026-11-15T07:00:00Z" }),
    kase("not-started-old", { createdAt: "2026-11-15T05:00:00Z" }),
    kase("waiting", { status: "IN_PROGRESS", intraop: { startedAt: "2026-11-15T06:00:00Z", endedAt: "2026-11-15T07:00:00Z" } }),
    kase("running-late", { status: "IN_PROGRESS", intraop: { startedAt: "2026-11-15T07:30:00Z" } }),
    kase("running-early", { status: "IN_PROGRESS", intraop: { startedAt: "2026-11-15T07:00:00Z" } }),
    kase("yesterday", { createdAt: "2026-11-14T09:00:00Z" }),
    kase("last-week", { status: "COMPLETE", createdAt: "2026-11-01T09:00:00Z", intraop: { startedAt: "2026-11-08T09:00:00Z" } }),
  ]

  it("puts days newest first, and within a day: running, waiting, not started, closed", () => {
    expect(ids(groupDashboardCases(cases, { now: NOW }))).toEqual([
      ["2026-11-15", [[null, ["running-early", "running-late", "waiting", "not-started-old", "not-started-new", "closed-late", "closed-early"]]]],
      ["2026-11-14", [[null, ["yesterday"]]]],
      // Listed under the day it was operated on, not the day it was created.
      ["2026-11-08", [[null, ["last-week"]]]],
    ])
  })

  it("splits a day by theatre in the site's order, cases without one last", () => {
    const theatres = [{ id: "t2", name: "Зала 2" }, { id: "t1", name: "Зала 1" }]
    const rows = [
      kase("none"),
      kase("one", { theatre: { id: "t1", name: "Зала 1" } }),
      kase("two-running", { status: "IN_PROGRESS", theatre: { id: "t2", name: "Зала 2" }, intraop: { startedAt: "2026-11-15T07:00:00Z" } }),
      kase("two", { theatre: { id: "t2", name: "Зала 2" } }),
    ]
    expect(ids(groupDashboardCases(rows, { now: NOW, theatres }))).toEqual([
      ["2026-11-15", [["Зала 2", ["two-running", "two"]], ["Зала 1", ["one"]], [null, ["none"]]]],
    ])
  })

  it("puts a hospital-wide viewer's own cases first within each stage, not above running ones", () => {
    const rows = [
      kase("theirs-running", { status: "IN_PROGRESS", userId: "other", intraop: { startedAt: "2026-11-15T07:00:00Z" } }),
      kase("theirs", { userId: "other", createdAt: "2026-11-15T05:00:00Z" }),
      kase("mine", { userId: "me", createdAt: "2026-11-15T07:00:00Z" }),
    ]
    expect(ids(groupDashboardCases(rows, { now: NOW, preferredUserId: "me" }))).toEqual([
      ["2026-11-15", [[null, ["theirs-running", "mine", "theirs"]]]],
    ])
  })
})

describe("labels", () => {
  it("reads the department's clock and names the day", () => {
    expect(departmentClock("2026-11-15T06:42:00Z")).toBe("08:42")
    expect(departmentClock(null)).toBeNull()
    expect(dashboardDayLabel("2026-11-15", "bg", NOW)).toBe("Днес")
    expect(dashboardDayLabel("2026-11-14", "bg", NOW)).toBe("Вчера")
    expect(dashboardDayLabel("2026-11-08", "bg", NOW)).toContain("ноември")
  })
})
