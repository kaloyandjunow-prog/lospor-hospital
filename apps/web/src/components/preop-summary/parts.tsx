import type { ReactNode } from "react"
import {
  CONSENT_SIGNER_LABELS,
  consentSigners,
  type ConsentBlock,
  type ConsentInline,
} from "@lospor/core/preop-documents"
import type { PreopSummaryLabels } from "./labels"
import type { SummaryFacts } from "./facts"

// The small parts every layout is built from. Ink only: the sheets print in
// black and white, so meaning never rests on colour alone.

export function Section({ title, hint, children, className }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`break-inside-avoid ${className ?? ""}`}>
      <h3 className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-blue-900 dark:text-blue-300 border-b border-blue-100 dark:border-blue-900/60 pb-0.5 mb-1">
        {title}{hint ? <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-400">{hint}</span> : null}
      </h3>
      {children}
    </section>
  )
}

export function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2 text-[10.5px] leading-snug">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  )
}

/** A labelled line to write on. */
export function PenLine({ label, width = "28mm" }: { label: string; width?: string }) {
  return (
    <div className="flex items-end gap-2 text-[10.5px] h-[7mm]">
      <span className="text-slate-500 shrink-0" style={{ width }}>{label}</span>
      <span className="flex-1 border-b border-dotted border-slate-400 dark:border-slate-500" />
    </div>
  )
}

/** A dotted gap in a sentence, for the pen. */
export function Blank({ width = "30mm" }: { width?: string }) {
  return <span className="inline-block border-b border-dotted border-slate-500 align-bottom h-[1.1em]" style={{ minWidth: width }} />
}

/** A tick box; ticked when LOSPOR knows the answer, empty for the pen otherwise. */
export function Box({ ticked = false }: { ticked?: boolean }) {
  return (
    <span className="inline-flex items-center justify-center w-[3.4mm] h-[3.4mm] border border-slate-800 dark:border-slate-300 mr-1 align-[-0.5mm] text-[9px] font-bold leading-none" aria-hidden={!ticked}>
      {ticked ? "×" : ""}
    </span>
  )
}

export function NameIdLines({ L }: { L: PreopSummaryLabels }) {
  return (
    <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-500">
      <div className="flex items-end gap-2 h-[7mm]"><span className="shrink-0">{L.name}</span><span className="flex-1 border-b border-slate-400 dark:border-slate-500" /></div>
      <div className="flex items-end gap-2 h-[7mm]"><span className="shrink-0">{L.id}</span><span className="flex-1 border-b border-slate-400 dark:border-slate-500" /></div>
    </div>
  )
}

export function AllergyFrame({ facts }: { facts: SummaryFacts }) {
  const { L, p } = facts
  if (facts.hasAllergy) return (
    <div className="border-2 border-red-600 dark:border-red-500 rounded px-2 py-1 text-[11px] font-bold text-red-700 dark:text-red-400" data-testid="preop-summary-allergy">
      {L.allergy}: {facts.allergyLine}
    </div>
  )
  return p?.allergies === false ? <p className="text-[10px] text-slate-500">{L.nkda}</p> : null
}

/** The row of measurements under the title: age, sex, height, weight, BMI, BSA, blood group. */
export function PatientStrip({ facts }: { facts: SummaryFacts }) {
  const { L, p } = facts
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10.5px]">
      {facts.ageText ? <Line label={L.age} value={facts.ageText} /> : null}
      {p?.sex === "MALE" || p?.sex === "FEMALE" ? <Line label={L.sex} value={p.sex === "MALE" ? L.male : L.female} /> : null}
      {p?.heightCm ? <Line label={L.height} value={`${p.heightCm} cm`} /> : null}
      {p?.weightKg ? <Line label={L.weight} value={`${p.weightKg} kg`} /> : null}
      {p?.bmi ? <Line label={L.bmi} value={String(Math.round(p.bmi * 10) / 10)} /> : null}
      {facts.bsa ? <Line label={L.bsa} value={`${facts.bsa} m²`} /> : null}
      {facts.bloodGroup ? <Line label={L.bloodGroup} value={facts.bloodGroup} /> : null}
    </div>
  )
}

export function Inline({ parts }: { parts: ConsentInline[] }) {
  return <>{parts.map((part, index) => part.bold ? <b key={index}>{part.text}</b> : <span key={index}>{part.text}</span>)}</>
}

/** Consent text blocks as written: headings, paragraphs, lists. */
export function ConsentBlocks({ blocks }: { blocks: ConsentBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === "heading") return <h4 key={index} className="text-[1.1em] font-bold mt-2 mb-0.5 break-after-avoid"><Inline parts={block.text} /></h4>
        if (block.kind === "list") return (
          <ul key={index} className="list-disc pl-4 mb-1.5">
            {block.items.map((item, itemIndex) => <li key={itemIndex}><Inline parts={item} /></li>)}
          </ul>
        )
        return <p key={index} className="mb-1.5"><Inline parts={block.text} /></p>
      })}
    </>
  )
}

/** Who signs, by age (Закон за здравето чл. 87): name, signature and date lines. */
export function SignerLines({ ageYears, locale, L }: { ageYears: number | null; locale: string; L: PreopSummaryLabels }) {
  const roles = CONSENT_SIGNER_LABELS[locale === "bg" ? "bg" : "en"]
  return (
    <div className="mt-4 space-y-3 break-inside-avoid" data-testid="consent-signers">
      {consentSigners(ageYears).map(role => (
        <div key={role} className="grid grid-cols-[48mm_1fr_1fr_28mm] gap-3 items-end text-[10px]">
          <span className="font-semibold">
            {roles[role]}
            {role === "PARENT" && ageYears == null ? <span className="block font-normal text-[9px] text-slate-500">{L.under18}</span> : null}
          </span>
          <span className="border-b border-slate-500 h-[7mm] relative"><span className="absolute -bottom-3.5 left-0 text-[8px] text-slate-400">{L.signerName}</span></span>
          <span className="border-b border-slate-500 h-[7mm] relative"><span className="absolute -bottom-3.5 left-0 text-[8px] text-slate-400">{L.signerSignature}</span></span>
          <span className="border-b border-slate-500 h-[7mm] relative"><span className="absolute -bottom-3.5 left-0 text-[8px] text-slate-400">{L.signerDate}</span></span>
        </div>
      ))}
    </div>
  )
}

/** Who consulted and signed, and who the case went to for intraop. */
export function ConsultationFooter({ facts, caseCode, note }: { facts: SummaryFacts; caseCode?: string | null; note?: string }) {
  const { L } = facts
  return (
    <footer className="mt-auto pt-2 border-t border-slate-300 text-[10.5px] space-y-1.5">
      <div className="flex items-end gap-3">
        <span className="text-slate-500">{L.consultedBy}:</span>
        <span className="font-semibold">{facts.consultant ?? ""}</span>
        {facts.consultedAt ? <span className="text-slate-500">{facts.consultedAt}</span> : null}
        <span className="ml-auto text-slate-500">{L.signature}</span>
        <span className="w-[40mm] border-b border-slate-400 dark:border-slate-500" />
      </div>
      <div className="flex items-end gap-3">
        <span className="text-slate-500">{L.handedTo}:</span>
        {facts.handedOn ? <span className="font-semibold">{facts.handedOn}</span> : <span className="flex-1 border-b border-dotted border-slate-400 dark:border-slate-500 h-[5mm]" />}
      </div>
      <SheetNote facts={facts} caseCode={caseCode} note={note} />
    </footer>
  )
}

export function SheetNote({ facts, caseCode, note }: { facts: SummaryFacts; caseCode?: string | null; note?: string }) {
  const { L } = facts
  return (
    <div className="flex justify-between gap-3 text-[9px] text-slate-400">
      <span>LOSPOR{caseCode ? ` · ${L.caseLbl} ${caseCode}` : ""}{note ? ` · ${note}` : ""}</span>
      <span>{L.printed} {facts.printedText}</span>
    </div>
  )
}
