import { apiServerFetch, getLiveSession } from "@/lib/live-session"
import { notFound, redirect } from "next/navigation"
import { getLocale } from "next-intl/server"
import { loginUrlForCallback } from "@/lib/safe-navigation"
import type { PreopSummaryData } from "@/components/preop-summary/PreopSummarySheet"
import { PreopSummaryView } from "@/components/preop-summary/PreopSummaryView"

/**
 * The preop summary: the stage between the preop assessment and intraop.
 * From here the anaesthetist keeps the case or hands it on, prints the
 * summary (with the consent, when the hospital uses it) and starts intraop.
 * Off unless the hospital has switched it on; then this page is not used.
 */
export default async function PreopSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getLiveSession()
  if (!session?.user?.id) redirect(loginUrlForCallback(`/cases/${encodeURIComponent(id)}/preop-summary`))

  const response = await apiServerFetch(`/v1/cases/${encodeURIComponent(id)}/print-data`)
  if (response.status === 404 || response.status === 403) notFound()
  if (!response.ok) throw new Error(`Unable to load the preop summary (${response.status})`)
  const data = await response.json() as PreopSummaryData & { userId: string; status: string }
  if (!data.preopDocuments?.summaryEnabled) redirect(`/cases/new?continue=${encodeURIComponent(id)}&step=1`)

  return (
    <PreopSummaryView
      caseId={id}
      data={data}
      locale={await getLocale()}
      sessionUserId={session.user.id}
      sessionRole={session.user.role}
    />
  )
}
