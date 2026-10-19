import {
  CONSENT_PARENT_ONLY_BELOW_YEARS,
  CONSENT_TECHNIQUE_LABELS,
  consentSections,
  consentTableColumns,
  consentTableRow,
  consentTechniquesToPrint,
  consentWithAssignedFasting,
  parseConsentText,
  type ConsentFastingRow,
  type ConsentFieldValues,
  type ConsentSection,
  type ConsentTechnique,
  type ConsentTemplateVersionView,
} from "@lospor/core/preop-documents"
import { preopSummaryLabels, type PreopSummaryLabels } from "./labels"
import { ConsentBlocks, Inline, NameIdLines, SignerLines } from "./parts"

/**
 * How the consent prints:
 *   full        the whole text in two columns, then the signatures (A, B)
 *   techniques  only the ticked techniques and general anaesthesia, each with
 *               a box for the patient's initials (C)
 *   table       the techniques as a table, word for word (D, the back of the sheet)
 *   keep        the whole text for the patient or parent to take home, unsigned (E)
 */
export type ConsentMode = "full" | "techniques" | "table" | "keep"

function SectionWithInitials({ section, L }: { section: ConsentSection; L: PreopSummaryLabels }) {
  return (
    <div className="break-inside-avoid mb-1.5" data-technique={section.technique ?? undefined}>
      <div className="flex items-end justify-between gap-3 mt-2 mb-0.5">
        <h4 className="text-[1.1em] font-bold"><Inline parts={section.heading} /></h4>
        {section.technique ? (
          <span className="flex items-end gap-1.5 text-[8.5px] text-slate-500 shrink-0">
            {L.initials}<span className="inline-block w-[18mm] h-[6mm] border border-slate-700" />
          </span>
        ) : null}
      </div>
      <ConsentBlocks blocks={section.blocks} />
    </div>
  )
}

function TechniqueTable({ sections, L }: { sections: ConsentSection[]; L: PreopSummaryLabels }) {
  const columns = consentTableColumns(sections)
  return (
    <table className="w-full border-collapse text-[8px] leading-[1.25] my-1.5 text-left" data-testid="consent-table">
      <thead>
        <tr>
          <th className="border border-slate-400 bg-slate-100 px-1 py-0.5 text-left w-[24mm]">{L.technique}</th>
          {columns.map(column => <th key={column} className="border border-slate-400 bg-slate-100 px-1 py-0.5 text-left">{column.replace(/[.:]\s*$/, "")}</th>)}
        </tr>
      </thead>
      <tbody>
        {sections.filter(section => section.technique).map((section, index) => {
          const row = consentTableRow(section, columns)
          return (
            <tr key={index} className="break-inside-avoid">
              <td className="border border-slate-400 px-1 py-0.5 align-top font-bold"><Inline parts={section.heading} /></td>
              {"span" in row
                ? <td colSpan={Math.max(columns.length, 1)} className="border border-slate-400 px-1 py-0.5 align-top"><ConsentBlocks blocks={row.span} /></td>
                : row.cells.map((cell, cellIndex) => <td key={cellIndex} className="border border-slate-400 px-1 py-0.5 align-top"><ConsentBlocks blocks={cell} /></td>)}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ConsentBody({ body, values, mode, techniques, L, lang }: {
  body: string
  values: ConsentFieldValues
  mode: ConsentMode
  techniques: readonly ConsentTechnique[]
  L: PreopSummaryLabels
  lang: "en" | "bg"
}) {
  if (mode === "full" || mode === "keep") {
    return <div className="consent-body text-[9.5px] leading-[1.38] columns-2 gap-5 text-justify"><ConsentBlocks blocks={parseConsentText(body, values)} /></div>
  }
  const { intro, sections } = consentSections(body, values)
  const others = sections.filter(section => !section.technique)
  if (mode === "table") {
    return (
      <div className="consent-body text-[9px] leading-[1.32] text-justify">
        <ConsentBlocks blocks={intro} />
        <TechniqueTable sections={sections} L={L} />
        {others.map((section, index) => <SectionWithInitials key={index} section={section} L={L} />)}
      </div>
    )
  }
  const wanted = consentTechniquesToPrint(techniques)
  const printed = sections.filter(section => !section.technique || wanted.has(section.technique))
  const skipped = sections.filter(section => section.technique && !wanted.has(section.technique))
  const firstOther = printed.findIndex(section => !section.technique)
  const techniquePart = firstOther < 0 ? printed : printed.slice(0, firstOther)
  const rest = firstOther < 0 ? [] : printed.slice(firstOther)
  return (
    <div className="consent-body text-[9.5px] leading-[1.38] text-justify">
      <ConsentBlocks blocks={intro} />
      {techniquePart.map((section, index) => <SectionWithInitials key={index} section={section} L={L} />)}
      {skipped.length > 0 ? (
        <p className="text-[9px] text-slate-600 italic my-1.5" data-testid="consent-not-planned">
          {L.notPlanned.replace("{list}", skipped.map(section => section.technique ? CONSENT_TECHNIQUE_LABELS[lang][section.technique] : "").join(", "))}
        </p>
      ) : null}
      {rest.map((section, index) => <SectionWithInitials key={index} section={section} L={L} />)}
    </div>
  )
}

/**
 * The written consent, printed after the summary and signed by hand. The
 * text is the hospital's (or the bundled one); the fields it names are
 * filled from the case. Who signs follows the patient's age (Закон за
 * здравето чл. 87), and the anaesthetist always signs. Name and ID stay
 * blank lines: the patient's name is never stored.
 */
export function ConsentSheet({ template, values, ageYears, locale, caseCode, mode = "full", techniques = [], plannedAnaesthesia, fasting }: {
  template: ConsentTemplateVersionView
  values: ConsentFieldValues
  ageYears: number | null
  locale: string
  caseCode?: string | null
  mode?: ConsentMode
  techniques?: readonly ConsentTechnique[]
  /** The anaesthesia planned at the preop visit, printed on its line; blank for the pen. */
  plannedAnaesthesia?: string
  /** The child's nil-by-mouth assignment; the consent's fasting list prints these hours. */
  fasting?: readonly ConsentFastingRow[] | null
}) {
  const L = preopSummaryLabels(locale)
  const lang = locale === "bg" ? "bg" : "en"
  const keep = mode === "keep"
  const child = ageYears != null && ageYears < CONSENT_PARENT_ONLY_BELOW_YEARS

  return (
    <div className="consent-pages bg-white text-slate-900" data-testid={keep ? "consent-keep" : "consent-sheet"} data-consent-version={template.version} data-consent-mode={mode}>
      <header className="border-b-2 border-blue-900 dark:border-blue-500 pb-1.5 mb-2">
        <div className="flex justify-between gap-3 text-[10px] text-slate-500">
          <span>{values.hospital}</span>
          {keep ? <span className="font-semibold uppercase tracking-[0.1em]">{child ? L.parentCopy : L.patientCopy}</span> : null}
        </div>
        <h2 className="text-[15px] font-bold leading-tight">{keep ? L.keepTitle : template.title}</h2>
      </header>

      {keep ? null : <div className="mb-1"><NameIdLines L={L} /></div>}
      <div className="text-[10.5px] mb-1"><span className="text-slate-500">{L.plannedProcedure}: </span><b>{values.procedure || "…………………………………………"}</b></div>
      {keep ? null : (
        <div className={`flex gap-2 text-[10.5px] mb-2 ${plannedAnaesthesia ? "items-baseline" : "items-end h-[7mm]"}`}>
          <span className="text-slate-500 shrink-0">{L.plannedAnaesthesia}:</span>
          {plannedAnaesthesia
            ? <b className="flex-1" data-testid="consent-planned-anaesthesia">{plannedAnaesthesia}</b>
            : <span className="flex-1 border-b border-dotted border-slate-400 dark:border-slate-500" />}
        </div>
      )}

      <ConsentBody body={consentWithAssignedFasting(template.body, fasting)} values={values} mode={mode} techniques={techniques} L={L} lang={lang} />

      {keep ? null : <SignerLines ageYears={ageYears} locale={locale} L={L} />}

      <footer className="mt-6 pt-1 border-t border-slate-200 text-[8.5px] text-slate-400">
        LOSPOR{caseCode ? ` · ${L.caseLbl} ${caseCode}` : ""}{mode === "table" ? ` · ${L.backOfSheet}` : ""} · {L.consentText}: „{template.title}“, {template.version === 0 ? L.bundled : `${L.version} ${template.version}`} · {template.sha256.slice(0, 12)}
      </footer>
    </div>
  )
}
