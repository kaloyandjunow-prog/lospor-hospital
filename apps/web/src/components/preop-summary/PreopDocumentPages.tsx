import type { ReactNode } from "react"
import {
  consentPopulationForAge,
  DEFAULT_PREOP_DOCUMENT_LAYOUT,
  preopAgeInYears,
  type ConsentFieldValues,
  type ConsentTechnique,
  type PreopDocumentLayout,
  titledName,
} from "@lospor/core/preop-documents"
import { plannedAnaesthesiaText } from "@lospor/core/preop-plan"
import { printGeneratedDate } from "@/components/case-summary/print-format"
import { ConsentSheet, type ConsentMode } from "./ConsentSheet"
import { DocumentTwoSheet } from "./DocumentTwoSheet"
import { PatientCopySheet } from "./PatientCopySheet"
import { PreopSummarySheet } from "./PreopSummarySheet"
import type { PreopSummaryData } from "./facts"

/** The layout the hospital chose in Status; B when the server sends none. */
export function preopDocumentLayout(data: PreopSummaryData): PreopDocumentLayout {
  return data.preopDocuments?.layout ?? DEFAULT_PREOP_DOCUMENT_LAYOUT
}

/** The consent text this patient gets, when the consent is on. */
export function consentTemplateFor(data: PreopSummaryData) {
  const documents = data.preopDocuments
  if (!documents?.consentEnabled || !documents.templates) return null
  return documents.templates[consentPopulationForAge(preopAgeInYears(data.preop))]
}

/** The case's values for the fields a consent text may name. */
export function consentFieldValues(data: PreopSummaryData, locale: string, printedAt: Date): ConsentFieldValues {
  return {
    hospital: [data.institution?.name, data.institution?.city].filter(Boolean).join(", ") || null,
    diagnosis: data.preop?.diagnosis ?? null,
    procedure: data.preop?.plannedProcedure ?? null,
    date: printGeneratedDate(printedAt, locale, data.intraop?.timezone ?? null),
    anaesthetist: titledName(data.createdBy),
  }
}

const CONSENT_MODE: Record<PreopDocumentLayout, ConsentMode> = { A: "full", B: "full", C: "techniques", D: "table", E: "keep" }

/** The first page of the chosen layout: what the summary page shows on screen. */
export function PreopSummaryFirstPage({ data, locale, printedAt, techniques = [] }: {
  data: PreopSummaryData
  locale: string
  printedAt: Date
  techniques?: readonly ConsentTechnique[]
}) {
  const layout = preopDocumentLayout(data)
  if (layout === "A") return <DocumentTwoSheet data={data} locale={locale} printedAt={printedAt} />
  return <PreopSummarySheet data={data} locale={locale} printedAt={printedAt} layout={layout} techniques={techniques} />
}

/**
 * Every page of the chosen layout, in print order, each its own sheet of
 * paper: the summary (or Document №2), the patient's take-home page for E,
 * then the consent in the layout's form when the consent is on.
 */
export function preopDocumentPages({ data, locale, printedAt, techniques }: {
  data: PreopSummaryData
  locale: string
  printedAt: Date
  techniques: readonly ConsentTechnique[]
}): Array<{ key: string; page: ReactNode }> {
  const layout = preopDocumentLayout(data)
  const template = consentTemplateFor(data)
  const pages: Array<{ key: string; page: ReactNode }> = [
    { key: "summary", page: <PreopSummaryFirstPage data={data} locale={locale} printedAt={printedAt} techniques={techniques} /> },
  ]
  if (layout === "E") pages.push({ key: "patient-copy", page: <PatientCopySheet data={data} locale={locale} printedAt={printedAt} /> })
  if (template) {
    pages.push({
      key: "consent",
      page: (
        <ConsentSheet
          template={template}
          values={consentFieldValues(data, locale, printedAt)}
          ageYears={preopAgeInYears(data.preop)}
          locale={locale}
          caseCode={data.caseCode}
          mode={CONSENT_MODE[layout]}
          techniques={techniques}
          fasting={data.preop?.pediatricFasting}
          plannedAnaesthesia={plannedAnaesthesiaText(data.preop?.plannedAnaesthesia, locale === "bg" ? "bg" : "en")}
        />
      ),
    })
  }
  return pages
}
