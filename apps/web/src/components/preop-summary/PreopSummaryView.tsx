"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, FileText, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HandoverButton } from "@/components/HandoverButton"
import { PreopSummaryFirstPage } from "./PreopDocumentPages"
import type { PreopSummaryData } from "./facts"

const TXT = {
  en: {
    title: "Preoperative summary",
    hint: "Keep the case or hand it over for the intraoperative stage, print the summary, then start intraop.",
    dashboard: "Dashboard",
    editPreop: "Edit preop",
    print: "Print summary",
    printWithConsent: "Print summary and consent",
    startIntraop: "Start intraop",
    handedOn: "This case is now with a colleague. You can still read and print it.",
  },
  bg: {
    title: "Предоперативно обобщение",
    hint: "Задръжте случая или го предайте за интраоперативния етап, отпечатайте обобщението и започнете интраоперативния етап.",
    dashboard: "Табло",
    editPreop: "Редактирай предоперативния преглед",
    print: "Отпечатай обобщението",
    printWithConsent: "Отпечатай обобщението и съгласието",
    startIntraop: "Започни интраоперативния етап",
    handedOn: "Случаят вече е при колега. Можете да го четете и отпечатвате.",
  },
}

/**
 * The summary page around the sheet: the actions of this stage on top, the
 * sheet itself below, exactly as it prints. Write actions (edit, start
 * intraop) show only while the case is the reader's to write.
 */
export function PreopSummaryView({ caseId, data, locale, sessionUserId, sessionRole }: {
  caseId: string
  data: PreopSummaryData & { userId: string; status: string }
  locale: string
  sessionUserId: string
  sessionRole: string
}) {
  const T = locale === "bg" ? TXT.bg : TXT.en
  const router = useRouter()
  const [printedAt] = useState(() => new Date())
  const canWrite = data.userId === sessionUserId && data.status !== "COMPLETE"
  const consent = data.preopDocuments?.consentEnabled === true

  return (
    <div className="max-w-4xl mx-auto space-y-4" data-testid="preop-summary-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-1 mb-1 -ml-2 text-slate-500"><ArrowLeft className="h-4 w-4" /> {T.dashboard}</Button>
          </Link>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{T.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">{canWrite ? T.hint : T.handedOn}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? (
            <Link href={`/cases/new?continue=${encodeURIComponent(caseId)}&step=0`}>
              <Button variant="outline" size="sm" className="gap-1.5" data-testid="preop-summary-edit"><Pencil className="h-4 w-4" /> {T.editPreop}</Button>
            </Link>
          ) : null}
          <HandoverButton
            caseId={caseId}
            caseOwnerId={data.userId}
            sessionUserId={sessionUserId}
            sessionRole={sessionRole}
            caseStatus={data.status}
            onTransferred={() => router.refresh()}
          />
          <Link href={`/cases/${encodeURIComponent(caseId)}/preop-summary/print`}>
            <Button variant="outline" size="sm" className="gap-1.5" data-testid="preop-summary-open-print"><FileText className="h-4 w-4" /> {consent ? T.printWithConsent : T.print}</Button>
          </Link>
          {canWrite ? (
            <Link href={`/cases/new?continue=${encodeURIComponent(caseId)}&step=1`}>
              <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" data-testid="preop-summary-start-intraop">{T.startIntraop} <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-[#2a2a2a] bg-white p-5 sm:p-8 shadow-sm overflow-x-auto">
        <div className="min-w-[640px]">
          <PreopSummaryFirstPage data={data} locale={locale} printedAt={printedAt} />
        </div>
      </div>
    </div>
  )
}
