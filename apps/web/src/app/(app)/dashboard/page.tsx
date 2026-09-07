import { apiServerJson, getLiveSession } from "@/lib/live-session"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FilePlus, FileText, Activity, Users } from "lucide-react"
import { PendingHandovers } from "@/components/PendingHandovers"
import { DashboardSearch } from "@/components/DashboardSearch"
import { getTranslations } from "next-intl/server"
import { isSameCalendarDay, isSameCalendarMonth, calendarMonthKey } from "@lospor/core/dashboard-date-scope"
import type React from "react"

type CaseRow = {
  id: string
  userId: string
  status: string
  caseCode: string | null
  createdAt: Date
  preop: {
    diagnosis: string | null
    plannedProcedure: string | null
    ageYears: number | null
    ageValue: number | null
    ageUnit: "DAYS" | "MONTHS" | "YEARS" | null
    sex: string | null
    asaScore: string | null
  } | null
  intraop: {
    monthYear: string | null
    durationMinutes: number | null
    endTime: string | null
  } | null
  postop: {
    disposition: string | null
    aldreteTotal: number | null
  } | null
  user: { name: string }
  transfers: Array<{ id: string; toUserId: string }>
  capabilities?: { canWrite: boolean } | null
}
type DashboardScope = "all" | "today" | "month" | "active" | "drafts" | "awaiting-postop" | "complete" | "handovers" | "icu"
type DashboardCounts = {
  all: number; today: number; month: number; active: number; drafts: number
  awaitingPostop: number; complete: number; icu: number; handovers: number
}

// The API caps `take` at 200 per request regardless of what is asked for, so
// "show me the next 200" means one more request for one more page, not a
// bigger `take` on the same request. `limit` is how many cases the page
// should show in total; this fetches however many 200-row pages that takes,
// in the server's own priority order, and concatenates them in order.
const PAGE_SIZE = 200

async function fetchDashboard(limit: number): Promise<{ cases: CaseRow[]; counts: DashboardCounts; total: number }> {
  const cases: Array<Omit<CaseRow, "createdAt"> & { createdAt: string }> = []
  let counts: DashboardCounts | null = null
  let total = 0
  for (let skip = 0; skip < Math.max(PAGE_SIZE, limit); skip += PAGE_SIZE) {
    const payload = await apiServerJson<{
      cases: Array<Omit<CaseRow, "createdAt"> & { createdAt: string }>
      counts: DashboardCounts
      total: number
    }>(`/v1/cases?skip=${skip}&take=${PAGE_SIZE}`)
    cases.push(...payload.cases)
    counts = payload.counts
    total = payload.total
    if (payload.cases.length < PAGE_SIZE) break // reached the end
  }
  return {
    cases: cases.map(item => ({ ...item, createdAt: new Date(item.createdAt) })),
    // counts/total come from the last page fetched -- they cover the whole
    // accessible set regardless of how many pages were requested, so any
    // page's response carries the same values.
    counts: counts!,
    total,
  }
}

// Kept for the visible case list only -- which cases these 200 rows contain
// is display order, not a count. The stat tiles and filter-chip counts read
// the server's `counts` instead, which cover every accessible case, not just
// this page. Both use the same Europe/Sofia calendar boundary as the API's
// own `dashboardCaseCounts`, so a case cannot read "today" here and
// "yesterday" there.
function isToday(date: Date, now: Date) {
  return isSameCalendarDay(date, now)
}

function isThisMonthCase(c: CaseRow, now: Date) {
  const my = c.intraop?.monthYear
  if (my) {
    const [y, m] = my.split("-").map(Number)
    return `${y}-${String(m).padStart(2, "0")}` === calendarMonthKey(now)
  }
  return isSameCalendarMonth(c.createdAt, now)
}

// Switching scope deliberately drops back to the first page of the new
// scope's own results, rather than carrying the previous scope's limit over.
function scopeHref(scope: DashboardScope) {
  return scope === "all" ? "/dashboard" : `/dashboard?scope=${scope}`
}

function loadMoreHref(scope: DashboardScope, limit: number) {
  const params = new URLSearchParams()
  if (scope !== "all") params.set("scope", scope)
  params.set("limit", String(limit + PAGE_SIZE))
  return `/dashboard?${params.toString()}`
}

function StatCard({
  href,
  active,
  icon,
  value,
  label,
}: {
  href: string
  active: boolean
  icon: React.ReactNode
  value: number
  label: string
}) {
  return (
    <Link href={href} className="block">
      <Card className={active ? "ring-2 ring-blue-500/70 dark:ring-blue-400/70" : ""}>
        <CardContent className="pt-6 flex items-center gap-4">
          {icon}
          <div>
            <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
            <p className="text-sm text-slate-500">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ scope?: string; limit?: string }> }) {
  const session = await getLiveSession()
  if (!session?.user?.id) return null
  const t = await getTranslations()
  const params = await searchParams
  const requestedScope = params?.scope
  const scope: DashboardScope = requestedScope === "today" || requestedScope === "month" || requestedScope === "active" || requestedScope === "drafts" || requestedScope === "awaiting-postop" || requestedScope === "complete" || requestedScope === "handovers" || requestedScope === "icu"
    ? requestedScope
    : "all"
  const requestedLimit = Number(params?.limit)
  const limit = Number.isFinite(requestedLimit) && requestedLimit > PAGE_SIZE
    ? Math.min(requestedLimit, 5000) // a generous ceiling, not an invitation to fetch the whole database in one page load
    : PAGE_SIZE

  const now = new Date()

  const { cases, counts, total } = await fetchDashboard(limit)

  // Stat tiles and filter-chip counts read the server's true counts over the
  // whole accessible set. `cases` below is only the display page (capped at
  // 200, open-work-first) -- it must never be re-summed into "the" count, or
  // the numbers regress to exactly the bug this replaced.
  const totalCases = counts.all
  const thisMonth = counts.month
  const icuCount = counts.icu
  const activeCount = counts.active
  const draftCount = counts.drafts
  const awaitingPostopCount = counts.awaitingPostop
  const completeCount = counts.complete
  const handoverCount = counts.handovers
  const filteredCases = cases.filter((c: CaseRow) => {
    if (scope === "all") return true
    if (scope === "today") return isToday(c.createdAt, now)
    if (scope === "month") return isThisMonthCase(c, now)
    if (scope === "active") return c.status !== "COMPLETE"
    if (scope === "drafts") return c.status === "DRAFT"
    if (scope === "awaiting-postop") return c.status !== "COMPLETE" && c.intraop?.endTime != null
    if (scope === "complete") return c.status === "COMPLETE"
    // "Handovers" means awaiting action by me -- matching counts.handovers
    // and /v1/cases/transfers/pending's own default (incoming). Not "any
    // pending transfer on a case I can see", which could include one I sent
    // and am waiting on someone else to accept, or (for an admin/HOD) a
    // handover between two other people.
    if (scope === "handovers") return c.transfers.some(t => t.toUserId === session.user.id)
    if (scope === "icu") return c.postop?.disposition === "ICU"
    return true
  })
  const asaDist = cases.reduce<Record<string, number>>((acc: Record<string, number>, c: CaseRow) => {
    const a = c.preop?.asaScore ?? "Unknown"
    acc[a] = (acc[a] ?? 0) + 1
    return acc
  }, {})
  void asaDist

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t("dashboard.title")}</h1>
        <p className="text-slate-500 text-sm mt-1">{t("dashboard.welcome")}, {session.user?.name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-tour="dashboard-stats">
        <StatCard
          href={scopeHref("all")}
          active={scope === "all"}
          icon={
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
          }
          value={totalCases}
          label={t("dashboard.totalCases")}
        />
        <StatCard
          href={scopeHref("month")}
          active={scope === "month"}
          icon={
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <Activity className="h-6 w-6 text-green-600" />
            </div>
          }
          value={thisMonth}
          label={t("dashboard.thisMonth")}
        />
        <StatCard
          href={scopeHref("icu")}
          active={scope === "icu"}
          icon={
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
              <Users className="h-6 w-6 text-red-600" />
            </div>
          }
          value={icuCount}
          label={t("dashboard.icuAdmissions")}
        />
      </div>

      <div data-testid="dashboard-scopes" className="flex gap-2 overflow-x-auto pb-1">
        {([
          ["all", "filterAll", totalCases],
          ["today", "filterToday", counts.today],
          ["month", "filterMonth", thisMonth],
          ["active", "filterActive", activeCount],
          ["drafts", "filterDrafts", draftCount],
          ["awaiting-postop", "filterAwaitingPostop", awaitingPostopCount],
          ["complete", "filterComplete", completeCount],
          ["handovers", "filterHandovers", handoverCount],
        ] as const).map(([key, labelKey, count]) => (
          <Link
            key={key}
            href={scopeHref(key)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
              scope === key
                ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            {t(`dashboard.${labelKey}`)} <span className="tabular-nums">{count}</span>
          </Link>
        ))}
      </div>

      {/* Pending incoming handovers */}
      <PendingHandovers />

      {/* Case list with search */}
      <Card data-tour="case-list">
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.recentCases")}</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredCases.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{t("dashboard.noCases")}</p>
              <p className="text-sm mt-1">{t("dashboard.noCasesDesc")}</p>
              <Link href="/cases/new" className="mt-4 inline-block">
                <Button size="sm" className="gap-2 mt-4">
                  <FilePlus className="h-4 w-4" /> {t("dashboard.newCase")}
                </Button>
              </Link>
            </div>
          ) : (
            <DashboardSearch
              cases={filteredCases}
              userId={session.user.id}
              role={session.user.role}
            />
          )}
          {cases.length < total && (
            // More cases exist beyond what this page fetched -- the true
            // count (`total`) said so, not the size of the loaded array.
            // Search and the scope filters above only ever see what has been
            // loaded, so an older matching case past this point stays
            // unreachable until "load more" is used.
            <div className="mt-4 text-center">
              <Link href={loadMoreHref(scope, limit)}>
                <Button variant="outline" size="sm">
                  {t("dashboard.loadMore")} ({cases.length} / {total})
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
