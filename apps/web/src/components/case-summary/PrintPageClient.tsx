"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Printer, FileDown } from "lucide-react"
import { useLocale } from "next-intl"
import { CaseSummary } from "@/components/CaseSummary"
import type { CaseDetail } from "@/types/case-detail"

const TXT = {
  en: {
    back: "Back to case", print: "Print", pdf: "Download PDF",
    hint: "Print settings: A4 · landscape · margins None · background graphics ON. “Download PDF” builds the finished A4 file for you — easiest on a phone.",
    privacy: "Patient name and ID stay blank — fill them in by hand after printing.",
  },
  bg: {
    back: "Към случая", print: "Печат", pdf: "Изтегли PDF",
    hint: "Настройки за печат: A4 · пейзаж · без полета · включени фонови графики. „Изтегли PDF“ създава готовия A4 файл — най-лесно от телефон.",
    privacy: "Името и ИД на пациента остават празни — попълват се на ръка след печат.",
  },
}

// The record sheets are laid out for A4 landscape ≈ 1123 CSS px. The stage
// always renders at that fixed width; narrow screens show it scaled down
// (a shrunken photo of the real sheet) instead of reflowing and mangling it.
const STAGE_W = 1123

// The dedicated print surface: the two-page record + print / download actions.
// Phones should normally not print from here at all — "Download PDF" fetches a
// server-rendered A4 PDF (see /api/cases/[id]/pdf), which is also what the
// mobile app opens directly.
export function PrintPageClient({ caseId, initialData, autoPrint, printToken }: {
  caseId: string
  initialData: CaseDetail
  autoPrint?: boolean
  printToken?: string
}) {
  const locale = useLocale()
  const T = locale === "bg" ? TXT.bg : TXT.en

  // The record is always light paper. globals.css maps `.dark .bg-white` etc.
  // to dark surfaces, which would skin the sheets — strip the theme class for
  // the lifetime of this page and restore it on the way out.
  useEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains("dark")
    root.classList.remove("dark")
    return () => { if (hadDark) root.classList.add("dark") }
  }, [])

  // Scale the fixed-width stage to fit the viewport (screen only).
  const [fit, setFit] = useState(1)
  useEffect(() => {
    const calc = () => setFit(Math.min(1, (window.innerWidth - 24) / STAGE_W))
    calc()
    window.addEventListener("resize", calc)
    return () => window.removeEventListener("resize", calc)
  }, [])

  useEffect(() => {
    if (!autoPrint) return
    // Phones get a real PDF via the Download button — never pop the mobile
    // browser's print dialog automatically.
    if (navigator.maxTouchPoints > 1) return
    const t = setTimeout(() => window.print(), 900)
    return () => clearTimeout(t)
  }, [autoPrint])

  const pdfHref = `/api/cases/${caseId}/pdf?lang=${locale === "bg" ? "bg" : "en"}${printToken ? `&print_token=${printToken}` : ""}`

  return (
    <div className="print-shell min-h-screen bg-slate-100 px-3 py-4">
      <div className="max-w-[1200px] mx-auto">
      {/* Always light paper: opt out of Chrome's Android auto-dark inversion
          (belt-and-braces with the page's viewport colorScheme export). */}
      <style>{`
        :root { color-scheme: only light; }
        @media print {
          .print-stage { zoom: 1 !important; width: auto !important; }
          .print-shell { padding: 0 !important; background: #ffffff !important; min-height: 0 !important; }
        }
      `}</style>

      {/* Control bar — screen only */}
      <div className="no-print flex items-center justify-between gap-3 flex-wrap mb-3">
        <Link href={`/cases/${caseId}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
          <ArrowLeft className="h-4 w-4" /> {T.back}
        </Link>
        <div className="flex items-center gap-2">
          <a href={pdfHref}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
            <FileDown className="h-4 w-4" /> {T.pdf}
          </a>
          <button type="button" onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] text-sm font-semibold rounded-lg transition-colors">
            <Printer className="h-4 w-4" /> {T.print}
          </button>
        </div>
      </div>
      <p className="no-print text-xs text-slate-400 dark:text-slate-500 mb-3">
        {T.hint} {T.privacy}
      </p>

      <div className="print-stage" style={{ width: STAGE_W, zoom: fit }}>
        <CaseSummary caseId={caseId} mode="print" initialData={initialData} />
      </div>
      </div>
    </div>
  )
}
