import { apiServerFetch } from "@/lib/live-session"
import { notFound, redirect } from "next/navigation"
import type { Viewport } from "next"
import { PrintPageClient } from "@/components/case-summary/PrintPageClient"
import type { CaseDetail } from "@/types/case-detail"

export const viewport: Viewport = { colorScheme: "only light" }

export default async function PrintCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ print_token?: string; pdf?: string }>
}) {
  const { id } = await params
  const values = await searchParams
  const printToken = values?.print_token
  const tokenQuery = printToken
    ? `?print_token=${encodeURIComponent(printToken)}`
    : ""

  const response = await apiServerFetch(
    `/v1/cases/${encodeURIComponent(id)}/print-data${tokenQuery}`,
  )
  if (response.status === 401 && !printToken) {
    redirect(`/login?callbackUrl=/cases/${id}/print`)
  }
  if ([401, 403, 404].includes(response.status)) notFound()
  if (!response.ok) {
    throw new Error(`Unable to load printable case (${response.status})`)
  }

  const initialData = await response.json() as CaseDetail
  const tokenMode = !!printToken
  const pdfMode = values?.pdf === "1"

  return (
    <PrintPageClient
      caseId={id}
      initialData={initialData}
      autoPrint={tokenMode && !pdfMode}
      printToken={tokenMode ? printToken : undefined}
    />
  )
}
