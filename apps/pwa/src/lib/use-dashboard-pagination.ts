import { useCallback, useState } from "react"
import { apiJson } from "@/lib/api"
import { notify } from "@/lib/notify"
import type { DashboardServerCounts } from "@/lib/dashboard-case-routing"
import type { TranslationKey } from "@/lib/preferences-context"

export function useDashboardPagination<CaseItem>(
  cases: CaseItem[],
  setCases: (updater: (prev: CaseItem[]) => CaseItem[]) => void,
  t: (key: TranslationKey) => string,
  timeoutMs: number,
) {
  const [counts, setCounts] = useState<DashboardServerCounts | null>(null)
  const [caseTotal, setCaseTotal] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  // Appends the server's next 200-row page in its own priority order -- take
  // is capped at 200 server-side, so this is the only way past the first page.
  const loadMoreCases = useCallback(async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const data = await apiJson<{ cases: CaseItem[]; counts?: DashboardServerCounts; total?: number }>(
        `/api/cases?skip=${cases.length}&take=200`,
        { timeoutMs },
      )
      setCases(prev => [...prev, ...(Array.isArray(data?.cases) ? data.cases : [])])
      if (data?.counts) setCounts(data.counts)
      if (data?.total != null) setCaseTotal(data.total)
    } catch {
      notify(t("error"), t("couldNotLoadCases"))
    } finally {
      setLoadingMore(false)
    }
  }, [cases.length, loadingMore, setCases, t, timeoutMs])

  return { counts, setCounts, caseTotal, setCaseTotal, loadingMore, loadMoreCases }
}
