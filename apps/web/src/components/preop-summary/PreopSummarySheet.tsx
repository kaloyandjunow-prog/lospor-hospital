import {
  CONSENT_FALLBACK_TECHNIQUE,
  CONSENT_TECHNIQUE_LABELS,
  CONSENT_TECHNIQUES,
  type ConsentTechnique,
  type PreopDocumentLayout,
} from "@lospor/core/preop-documents"
import { displayClinicalCode } from "@/lib/clinical-display"
import { summaryFacts, type PreopSummaryData, type SummaryFacts } from "./facts"
import { AllergyFrame, Box, ConsultationFooter, Line, NameIdLines, PatientStrip, PenLine, Section, SignerLines } from "./parts"
import { Questionnaire } from "./Questionnaire"

export type { PreopSummaryData } from "./facts"

/** Conditions, medications, examination, airway, scores, labs and nil by mouth, in two columns. */
function SummaryDetails({ facts, locale }: { facts: SummaryFacts; locale: string }) {
  const { L, p } = facts
  const airway = p?.mallampati || p?.mouthOpeningCm || p?.thyromental || p?.neckMobility || p?.upperLipBiteTest
    || p?.difficultAirwayHistory === true || p?.anticipatedDifficultAirway === true
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
      {facts.comorbidities.length > 0 ? (
        <Section title={L.comorbidities}>
          <ul className="text-[10.5px] leading-snug space-y-0.5" data-testid="preop-summary-conditions">
            {facts.comorbidities.map((tag, index) => <li key={index}>{[tag.label, tag.code ? `(${tag.code})` : null].filter(Boolean).join(" ")}</li>)}
          </ul>
        </Section>
      ) : null}
      {facts.medications.length > 0 ? (
        <Section title={L.medications}>
          <ul className="text-[10.5px] leading-snug space-y-0.5">
            {facts.medications.map((tag, index) => <li key={index}>{tag.label}{tag.code ? <span className="text-slate-400"> ({tag.code})</span> : null}</li>)}
          </ul>
        </Section>
      ) : null}
      {facts.vitals ? <Section title={L.exam}><p className="text-[10.5px]">{facts.vitals}</p></Section> : null}
      {airway ? (
        <Section title={L.airway}>
          <div className="space-y-0.5">
            {p?.mallampati ? <Line label="Mallampati" value={displayClinicalCode("option:MALLAMPATI", p.mallampati, locale)} /> : null}
            {p?.mouthOpeningCm ? <Line label={L.mouthOpening} value={`${p.mouthOpeningCm} cm`} /> : null}
            {p?.thyromental ? <Line label={L.thyromental} value={`${p.thyromental} cm`} /> : null}
            {p?.neckMobility ? <Line label={L.neck} value={displayClinicalCode("option:NECK_MOBILITY", p.neckMobility, locale)} /> : null}
            {p?.upperLipBiteTest ? <Line label={L.ulbt} value={displayClinicalCode("option:UPPER_LIP_BITE", p.upperLipBiteTest, locale)} /> : null}
            {p?.difficultAirwayHistory === true ? <p className="text-[10.5px] font-semibold text-red-700 dark:text-red-400">{L.difficultAirway}{p.difficultAirwayNotes ? `: ${p.difficultAirwayNotes}` : ""}</p> : null}
            {p?.anticipatedDifficultAirway === true ? <p className="text-[10.5px] font-semibold text-red-700 dark:text-red-400">{L.anticipatedDifficultAirway}</p> : null}
          </div>
        </Section>
      ) : null}
      {facts.scores.length > 0 ? (
        <Section title={L.scores}>
          <ul className="text-[10.5px] leading-snug space-y-0.5" data-testid="preop-summary-scores">{facts.scores.map(score => <li key={score}>{score}</li>)}</ul>
        </Section>
      ) : null}
      {facts.labs.length > 0 ? (
        <Section title={L.labs}>
          <div className="grid grid-cols-2 gap-x-3 text-[10.5px] leading-snug">
            {facts.labs.slice(0, 16).map((lab, index) => <div key={index}>{lab.test} <b>{lab.value}</b>{lab.unit ? ` ${lab.unit}` : ""}</div>)}
          </div>
        </Section>
      ) : null}
      {facts.fasting.length > 0 ? (
        <Section title={L.npo}>
          <ul className="text-[10.5px] leading-snug space-y-0.5">
            {facts.fasting.map(row => <li key={row.category}>{L.fastingCategories[row.category] ?? row.category}: {L.npoHours.replace("{hours}", String(row.hoursBefore))}</li>)}
          </ul>
        </Section>
      ) : null}
      {facts.orders.all.length > 0 ? (
        <Section title={L.wardOrders}>
          <ul className="text-[10.5px] leading-snug space-y-0.5" data-testid="preop-summary-ward-orders">{facts.orders.all.map(text => <li key={text}>{text}</li>)}</ul>
        </Section>
      ) : null}
      {facts.medicationOrders.all.length > 0 ? (
        <Section title={L.medsInstr}>
          <ul className="text-[10.5px] leading-snug space-y-0.5" data-testid="preop-summary-medication-instructions">{facts.medicationOrders.all.map((text, index) => <li key={index}>{text}</li>)}</ul>
        </Section>
      ) : null}
      {facts.premedication.night.length + facts.premedication.morning.length > 0 ? (
        <Section title={L.premedTitle}>
          <ul className="text-[10.5px] leading-snug space-y-0.5" data-testid="preop-summary-premedication">
            {facts.premedication.night.length > 0 ? <li>{L.premedEvening}: {facts.premedication.night.join(", ")}</li> : null}
            {facts.premedication.morning.length > 0 ? <li>{L.premedMorning}: {facts.premedication.morning.join(", ")}</li> : null}
          </ul>
        </Section>
      ) : null}
    </div>
  )
}

/** Layout C: the techniques ticked before printing; the consent describes these. */
function PlannedTechniques({ facts, techniques }: { facts: SummaryFacts; techniques: readonly ConsentTechnique[] }) {
  const labels = CONSENT_TECHNIQUE_LABELS[facts.lang]
  return (
    <Section title={facts.L.plannedAnaesthesia} hint={facts.L.plannedHint}>
      <div className="grid grid-cols-4 gap-x-3 gap-y-1 text-[10px]" data-testid="preop-summary-techniques">
        {CONSENT_TECHNIQUES.map(technique => (
          <span key={technique}>
            <Box ticked={technique === CONSENT_FALLBACK_TECHNIQUE || techniques.includes(technique)} />{labels[technique]}
            {technique === CONSENT_FALLBACK_TECHNIQUE ? <span className="text-slate-500"> ({facts.L.fallback})</span> : null}
          </span>
        ))}
      </div>
    </Section>
  )
}

/**
 * The first page of the preop summary for layouts B, C, D and E: what the
 * colleague taking the case to theatre needs, and the whole questionnaire
 * with every answer. D is the dense one-sheet front (with an emergency
 * frame); C shows the techniques the consent will describe; E is the
 * hospital's copy, signed for the information the patient takes home.
 * Patient name and ID are blank lines for the pen: they are never stored.
 */
export function PreopSummarySheet({ data, locale, printedAt, layout = "B", techniques = [] }: {
  data: PreopSummaryData
  locale: string
  printedAt: Date
  layout?: Exclude<PreopDocumentLayout, "A">
  techniques?: readonly ConsentTechnique[]
}) {
  const facts = summaryFacts(data, locale, printedAt)
  const { L, p } = facts
  const dense = layout === "D"
  const consent = data.preopDocuments?.consentEnabled === true

  return (
    <div className={`preop-summary-page bg-white text-slate-900 flex flex-col ${dense ? "gap-1.5" : "gap-2.5"}`} data-testid="preop-summary-sheet" data-layout={layout}>
      <header className="flex items-start justify-between gap-3 border-b-2 border-blue-900 dark:border-blue-500 pb-1.5">
        <div className="min-w-0">
          <div className="text-[10px] text-slate-500">{facts.institution}</div>
          <h2 className="text-[15px] font-bold leading-tight">{L.title}</h2>
          {layout === "E" ? <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">{L.hospitalCopy}</div> : null}
        </div>
        <div className="text-right text-[10px] text-slate-500 shrink-0">
          {data.caseCode ? <div className="font-bold text-slate-800">{L.caseLbl} {data.caseCode}</div> : null}
          {facts.consultedAt ? <div>{facts.consultedAt}</div> : null}
        </div>
      </header>

      {dense && p?.emergencySurgery ? (
        <div className="border-2 border-slate-900 px-2 py-1 text-[11px] font-bold" data-testid="preop-summary-emergency"><Box ticked />{L.emergencyBanner}</div>
      ) : null}

      <NameIdLines L={L} />
      <PatientStrip facts={facts} />
      {facts.diagnosisText ? <Line label={L.diagnosis} value={facts.diagnosisText} /> : null}
      {facts.procedureText ? (
        <Line label={L.operation} value={[facts.procedureText, facts.urgencyText, p?.highRiskSurgery ? L.highRisk : null].filter(Boolean).join(" · ")} />
      ) : null}
      <AllergyFrame facts={facts} />

      {facts.questionnaire.length > 0 ? (
        <Section title={L.questionnaire} hint={L.questionnaireHint}>
          <Questionnaire items={facts.questionnaire} lang={facts.lang} L={L} variant={dense ? "compact" : "list"} />
        </Section>
      ) : null}

      <SummaryDetails facts={facts} locale={locale} />

      {layout === "C" && consent ? <PlannedTechniques facts={facts} techniques={techniques} /> : null}

      <Section title={L.plan}>
        {facts.plannedText ? <Line label={L.planAnaesthesia} value={facts.plannedText} /> : <PenLine label={L.planAnaesthesia} />}
        <PenLine label={L.planFasting} />
        <PenLine label={L.planMedications} />
        <PenLine label={L.planProphylaxis} />
        <PenLine label={L.conclusion} />
      </Section>

      {layout === "E" && consent ? (
        <Section title={L.consentTitle}>
          <p className="text-[10.5px] leading-snug" data-testid="preop-summary-acknowledgement">{facts.child ? L.acknowledgementChild : L.acknowledgementAdult}</p>
          <SignerLines ageYears={facts.ageYears} locale={locale} L={L} />
        </Section>
      ) : null}

      <ConsultationFooter facts={facts} caseCode={data.caseCode} note={dense ? L.frontOfSheet : undefined} />
    </div>
  )
}
