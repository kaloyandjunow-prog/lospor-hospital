"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Printer } from "lucide-react"
import { useLocale } from "next-intl"
import { CaseSummary } from "@/components/CaseSummary"
import type { CaseDetail } from "@/types/case-detail"

const TXT = {
  en: {
    back: "Back to case",
    print: "Print / Save as PDF",
    hint: "LOSPOR does not generate or download a PDF on the server. Use your browser's print dialog: A4 · landscape · margins None · background graphics ON. Choose Save as PDF only if your device offers it.",
    privacy: "Patient name and ID stay blank — fill them in by hand after printing.",
  },
  bg: {
    back: "Към случая",
    print: "Печат / Запази като PDF",
    hint: "LOSPOR не генерира и не изтегля PDF на сървъра. Използвайте диалога за печат на браузъра: A4 · пейзаж · без полета · включени фонови графики. Изберете Запази като PDF само ако устройството го предлага.",
    privacy: "Името и ИЗ на пациента остават празни — попълват се на ръка след печат.",
  },
}

// The record sheets are laid out for A4 landscape ≈ 1123 CSS px. The stage
// always renders at that fixed width; narrow screens show it scaled down
// instead of reflowing and mangling the approved layout.
const STAGE_W = 1123

// The dedicated printable HTML surface. It has one honest action: open the
// browser's print dialog. Any PDF file is created by the user's browser/device,
// not by the Hospital API.
export function PrintPageClient({ caseId, initialData, autoPrint }: {
  caseId: string
  initialData: CaseDetail
  autoPrint?: boolean
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
    // Do not surprise touch users with a print dialog as soon as the external
    // browser opens. The visible action below works on devices that support it.
    if (navigator.maxTouchPoints > 1) return
    const timer = setTimeout(() => window.print(), 900)
    return () => clearTimeout(timer)
  }, [autoPrint])

  return (
    <div className="print-shell min-h-screen bg-slate-100 px-3 py-4">
      <div className="max-w-[1200px] mx-auto">
      {/* Always light paper: opt out of Chrome's Android auto-dark inversion. */}
      <style>{`
        :root { color-scheme: only light; }
        @media print {
          .print-stage { zoom: 1 !important; width: auto !important; }
          .print-shell { padding: 0 !important; background: #ffffff !important; min-height: 0 !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between gap-3 flex-wrap mb-3">
        <Link href={`/cases/${caseId}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
          <ArrowLeft className="h-4 w-4" /> {T.back}
        </Link>
        <button type="button" onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
          <Printer className="h-4 w-4" /> {T.print}
        </button>
      </div>
      <p className="no-print text-xs text-slate-500 mb-3">
        {T.hint} {T.privacy}
      </p>

      <div className="print-stage" style={{ width: STAGE_W, zoom: fit }}>
        <CaseSummary caseId={caseId} mode="print" initialData={initialData} />
      </div>
      </div>
    </div>
  )
}
