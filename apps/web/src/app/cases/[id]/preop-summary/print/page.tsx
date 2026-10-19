import { apiServerFetch } from "@/lib/live-session"
import { notFound, redirect } from "next/navigation"
import type { Viewport } from "next"
import { PreopSummaryPrintClient } from "@/components/preop-summary/PreopSummaryPrintClient"
import type { PreopSummaryData } from "@/components/preop-summary/facts"
import { parseConsentTechniques } from "@lospor/core/preop-documents"
import { consentTechniquesForPlan } from "@lospor/core/preop-plan"
import { loginUrlForCallback } from "@/lib/safe-navigation"

export const viewport: Viewport = { colorScheme: "only light" }

// The preop summary and consent as paper. Outside (app), like the record's
// print page, so headless Chrome can open it with only a print token.
export default async function PreopSummaryPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ print_token?: string; pdf?: string; techniques?: string }>
}) {
  const { id } = await params
  const values = await searchParams
  const printToken = values?.print_token
  const tokenQuery = printToken ? `?print_token=${encodeURIComponent(printToken)}` : ""

  const response = await apiServerFetch(`/v1/cases/${encodeURIComponent(id)}/print-data${tokenQuery}`)
  if (response.status === 401 && !printToken) redirect(loginUrlForCallback(`/cases/${encodeURIComponent(id)}/preop-summary/print`))
  if ([401, 403, 404].includes(response.status)) notFound()
  if (!response.ok) throw new Error(`Unable to load the preop summary (${response.status})`)
  const data = await response.json() as PreopSummaryData
  if (!data.preopDocuments?.summaryEnabled) notFound()

  return (
    <PreopSummaryPrintClient
      caseId={id}
      data={data}
      printToken={printToken}
      pdfMode={values?.pdf === "1"}
      // Layout C starts from the anaesthesia planned at the preop visit, until
      // the anaesthetist changes the ticks (the PDF then carries them).
      initialTechniques={values?.techniques == null
        ? consentTechniquesForPlan(data.preop?.plannedAnaesthesia)
        : parseConsentTechniques(values.techniques)}
    />
  )
}
