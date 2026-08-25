import Link from "next/link"
import { ChevronLeft, ChevronRight, Send } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"
import { CentralCaseExportControl } from "@/components/CentralCaseExportControl"
import { apiServerFetch, getLiveSession } from "@/lib/live-session"
import { parseCentralDeliveryCaseList } from "@/lib/central-case-export-control"

function pageNumber(raw: string | undefined): number {
  if (!raw || !/^\d{1,6}$/.test(raw)) return 0
  const value = Number(raw)
  return Number.isSafeInteger(value) && value <= 100_000 ? value : 0
}

function pageHref(page: number): string {
  return page === 0 ? "/central-delivery" : `/central-delivery?page=${page}`
}

export default async function CentralDeliveryPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>
}) {
  const [session, params, t, locale] = await Promise.all([
    getLiveSession(),
    searchParams,
    getTranslations("centralDeliveryList"),
    getLocale(),
  ])
  if (!session?.user?.id || session.user.accountKind !== "CLINICAL") return null

  const requestedPage = pageNumber(params?.page)
  const response = await apiServerFetch(`/v1/hospital/central-cases?page=${requestedPage}`).catch(() => null)
  const raw = response?.ok ? await response.json().catch(() => null) : null
  const list = parseCentralDeliveryCaseList(raw)
  const dateFormatter = new Intl.DateTimeFormat(locale === "bg" ? "bg-BG" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  })

  if (!list) {
    return (
      <section className="mx-auto max-w-4xl" aria-labelledby="central-delivery-list-title">
        <h1 id="central-delivery-list-title" className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          {t("title")}
        </h1>
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" role="alert">
          {t("unavailable")}
        </p>
      </section>
    )
  }

  const first = list.total === 0 ? 0 : list.page * list.pageSize + 1
  const last = Math.min(list.total, (list.page + 1) * list.pageSize)
  const hasPrevious = list.page > 0
  const hasNext = last < list.total

  return (
    <section className="mx-auto max-w-4xl" aria-labelledby="central-delivery-list-title">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Send className="h-6 w-6 text-sky-600" aria-hidden="true" />
          <h1 id="central-delivery-list-title" className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {t("title")}
          </h1>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("description")}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{t("privacy")}</p>
      </div>

      {list.cases.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <p className="font-medium text-slate-700 dark:text-slate-200">{t("empty")}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("emptyDescription")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {list.cases.map((item, index) => (
            <article key={item.caseId} className="rounded-xl border border-slate-200 bg-white pt-4 dark:border-slate-700 dark:bg-slate-900/40">
              <div className="px-4">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {t("caseLabel", { number: first + index })}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("finalizedAt", { value: dateFormatter.format(new Date(item.finalizedAt)) })}
                </p>
              </div>
              <div className="mt-4 [&_[data-testid=central-case-export-control]]:mb-0 [&_[data-testid=central-case-export-control]]:border-x-0 [&_[data-testid=central-case-export-control]]:border-b-0">
                <CentralCaseExportControl caseId={item.caseId} initialControl={item.control} />
              </div>
            </article>
          ))}
        </div>
      )}

      <nav className="mt-6 flex items-center justify-between gap-4" aria-label={t("paginationLabel")}>
        {hasPrevious ? (
          <Link href={pageHref(list.page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {t("previous")}
          </Link>
        ) : <span />}
        <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
          {t("range", { first, last, total: list.total })}
        </p>
        {hasNext ? (
          <Link href={pageHref(list.page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            {t("next")} <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : <span />}
      </nav>
    </section>
  )
}
