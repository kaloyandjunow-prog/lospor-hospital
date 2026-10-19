"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Printer } from "lucide-react"
import { useLocale } from "next-intl"
import { toast } from "sonner"
import {
  CONSENT_FALLBACK_TECHNIQUE,
  CONSENT_TECHNIQUE_LABELS,
  CONSENT_TECHNIQUES,
  type ConsentTechnique,
} from "@lospor/core/preop-documents"
import { consentTemplateFor, preopDocumentLayout, preopDocumentPages } from "./PreopDocumentPages"
import { preopSummaryLabels } from "./labels"
import type { PreopSummaryData } from "./facts"

const TXT = {
  en: {
    back: "Back to the summary", print: "Print",
    hint: "Print settings: A4 · portrait · background graphics ON. Patient name and ID stay blank — fill them in by hand.",
    duplex: "Layout D: print on both sides of one sheet.",
    recordFailed: "The print could not be recorded on the case. Print again when you are back online.",
  },
  bg: {
    back: "Към обобщението", print: "Печат",
    hint: "Настройки за печат: A4 · портрет · включени фонови графики. Името и ИД на пациента остават празни — попълват се на ръка.",
    duplex: "Вариант D: отпечатайте двустранно на един лист.",
    recordFailed: "Отпечатването не можа да бъде отбелязано в случая. Отпечатайте отново, когато връзката се възстанови.",
  },
}

/** Layout C, on screen only: tick the planned techniques before printing. */
function TechniquePicker({ locale, chosen, onChange }: { locale: string; chosen: readonly ConsentTechnique[]; onChange: (next: ConsentTechnique[]) => void }) {
  const L = preopSummaryLabels(locale)
  const labels = CONSENT_TECHNIQUE_LABELS[locale === "bg" ? "bg" : "en"]
  return (
    <fieldset className="w-full rounded-lg border border-slate-300 bg-white p-3" data-testid="preop-technique-picker">
      <legend className="px-1 text-sm font-semibold text-slate-700">{L.chooseTechniques}</legend>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CONSENT_TECHNIQUES.map(technique => (
          <label key={technique} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={technique === CONSENT_FALLBACK_TECHNIQUE || chosen.includes(technique)}
              disabled={technique === CONSENT_FALLBACK_TECHNIQUE}
              onChange={event => onChange(event.target.checked
                ? CONSENT_TECHNIQUES.filter(item => item === technique || chosen.includes(item))
                : chosen.filter(item => item !== technique))}
              data-testid={`preop-technique-${technique}`}
            />
            {labels[technique]}
          </label>
        ))}
      </div>
      {chosen.length === 0 ? <p className="mt-2 text-xs text-slate-500">{L.noneTicked}</p> : null}
    </fieldset>
  )
}

/**
 * The preop summary and, when the hospital has switched it on, the written
 * consent, in the layout chosen in Status, as A4 portrait paper. Printing
 * the consent records which text was on the sheet (version, fingerprint,
 * layout and, for C, the techniques). Headless Chrome renders this page for
 * the PDF with a print token and records nothing: the button that asked for
 * the PDF already did.
 */
export function PreopSummaryPrintClient({ caseId, data, printToken, pdfMode, initialTechniques = [] }: {
  caseId: string
  data: PreopSummaryData
  printToken?: string
  pdfMode?: boolean
  initialTechniques?: ConsentTechnique[]
}) {
  const locale = useLocale()
  const T = locale === "bg" ? TXT.bg : TXT.en
  const [printedAt] = useState(() => new Date())
  const [techniques, setTechniques] = useState<ConsentTechnique[]>(initialTechniques)

  useEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains("dark")
    root.classList.remove("dark")
    return () => { if (hadDark) root.classList.add("dark") }
  }, [])

  const layout = preopDocumentLayout(data)
  const template = consentTemplateFor(data)
  const chosen = layout === "C" ? techniques : []
  const pages = preopDocumentPages({ data, locale, printedAt, techniques: chosen })

  async function recordPrint(): Promise<void> {
    if (!template || printToken) return
    const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/consent-prints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        population: template.population,
        version: template.version,
        sha256: template.sha256,
        layout,
        ...(layout === "C" ? { techniques: [CONSENT_FALLBACK_TECHNIQUE, ...chosen] } : {}),
      }),
    }).catch(() => null)
    if (!response?.ok) toast.error(T.recordFailed)
  }

  // LOSPOR Hospital prints this page in the browser: the appliance makes no
  // server PDF (the PDF route answers 410), so Print is the one action, and a
  // PDF is the browser's own "Save as PDF" when the device offers it.

  // Server-rendered with its data: ready for headless Chrome as soon as it loads.
  return (
    <div className="preop-print-shell min-h-screen bg-slate-100 px-3 py-4" data-preop-summary-ready="" data-layout={layout}>
      <style>{`
        :root { color-scheme: only light; }
        @page { size: A4 portrait; margin: 12mm 13mm 14mm; }
        @media print {
          .preop-print-shell { padding: 0 !important; background: #ffffff !important; min-height: 0 !important; }
          .preop-print-chrome { display: none !important; }
          .preop-paper { box-shadow: none !important; border: 0 !important; padding: 0 !important; margin: 0 !important; width: auto !important; min-height: 0 !important; }
          .preop-paper + .preop-paper { break-before: page; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div className="max-w-[820px] mx-auto">
        {!pdfMode ? (
          <div className="preop-print-chrome flex flex-wrap items-center gap-2 mb-3">
            <Link href={`/cases/${caseId}/preop-summary`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" /> {T.back}
            </Link>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => { void recordPrint().finally(() => window.print()) }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" data-testid="preop-summary-print">
                <Printer className="h-4 w-4" /> {T.print}
              </button>
            </div>
            <p className="w-full text-xs text-slate-500">{T.hint}{layout === "D" ? ` ${T.duplex}` : ""}</p>
            {layout === "C" && template ? <TechniquePicker locale={locale} chosen={techniques} onChange={setTechniques} /> : null}
          </div>
        ) : null}
        {pages.map(({ key, page }) => (
          <div key={key} className="preop-paper bg-white shadow-sm border border-slate-200 rounded-lg mx-auto w-[210mm] min-h-[297mm] p-[12mm] mb-4">
            {page}
          </div>
        ))}
      </div>
    </div>
  )
}
