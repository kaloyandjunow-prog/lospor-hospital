import { displayClinicalCode } from "@/lib/clinical-display"
import { summaryFacts, type PreopSummaryData } from "./facts"
import { Blank, Box, Line, PenLine } from "./parts"
import { Questionnaire } from "./Questionnaire"

function SecTitle({ children }: { children: string }) {
  return <h3 className="text-[10px] font-bold uppercase mt-2.5 mb-1 tracking-[0.02em]">{children}</h3>
}

function Value({ children }: { children: string | number | null | undefined }) {
  return children == null || children === "" ? <Blank width="18mm" /> : <b className="font-semibold">{children}</b>
}

/**
 * Layout A: the ward's Document №2 with what LOSPOR holds printed in. The
 * same order as the paper, sections I to V, then the report the
 * anaesthetist completes by pen. The questionnaire is LOSPOR's, every
 * question with its answer, under the paper's yes/no columns. Name, ЕГН and
 * file number stay blank lines: they are never stored.
 */
export function DocumentTwoSheet({ data, locale, printedAt }: { data: PreopSummaryData; locale: string; printedAt: Date }) {
  const facts = summaryFacts(data, locale, printedAt)
  const { L, p } = facts
  const fastHours = (category: string) => facts.fasting.find(row => row.category === category)?.hoursBefore ?? null
  const solids = fastHours("SOLID_FOOD_OR_COW_MILK")
  const water = fastHours("CLEAR_FLUIDS")

  return (
    <div className="preop-summary-page bg-white text-slate-900 text-[10px] leading-snug" data-testid="preop-summary-sheet" data-layout="A">
      <div className="flex justify-between gap-4 text-[9px] border-b border-slate-800 pb-1 mb-1.5">
        <span>{facts.institution}</span>
        <span>{L.supplementTo} <Blank width="16mm" /> · {L.docTwo}</span>
      </div>
      <h2 className="text-center text-[11.5px] font-bold uppercase my-1.5">{facts.child ? L.docTitleChild : L.docTitleAdult}</h2>

      <div className="space-y-1">
        <div>{L.name} <Blank width="95mm" /> {L.age} <Value>{facts.ageText}</Value> {L.height} <Value>{p?.heightCm ? `${p.heightCm} cm` : null}</Value> {L.weight} <Value>{p?.weightKg ? `${p.weightKg} kg` : null}</Value></div>
        <div>{L.id} <Blank width="55mm" /> {L.ward} <Blank /> {L.room} <Blank width="12mm" /> {L.bloodGroup} <Value>{facts.bloodGroup}</Value></div>
        <div>{L.surgeon} <Blank width="70mm" /></div>
        <div>{L.diagnosis}: <Value>{facts.diagnosisText}</Value></div>
        <div>{L.operation}: <Value>{[facts.procedureText, facts.urgencyText].filter(Boolean).join(" · ")}</Value></div>
        {facts.hasAllergy ? <div className="border-2 border-slate-900 px-2 py-0.5 font-bold" data-testid="preop-summary-allergy">{L.allergy}: {facts.allergyLine}</div> : null}
      </div>

      <SecTitle>{L.secQuestionnaire}</SecTitle>
      <Questionnaire items={facts.questionnaire} lang={facts.lang} L={L} variant="table" />
      <div className="mt-1">{L.medications}: <Value>{facts.medications.map(tag => tag.label).join(", ")}</Value></div>
      <div>{L.comorbidities}: <Value>{facts.comorbidities.map(tag => [tag.code, tag.label].filter(Boolean).join(" ")).join("; ")}</Value></div>

      <SecTitle>{L.secExam}</SecTitle>
      <div>{facts.vitals || <Blank width="120mm" />}</div>
      <div className="grid grid-cols-3 gap-x-4 mt-1">
        {L.systems.map(system => <div key={system}>{system}: <Blank width="38mm" /></div>)}
      </div>

      <SecTitle>{L.secLabs}</SecTitle>
      {facts.labs.length > 0 ? (
        <div className="grid grid-cols-4 border border-slate-400">
          {facts.labs.slice(0, 16).map((lab, index) => (
            <div key={index} className="border border-slate-300 px-1 py-0.5"><span className="text-slate-500 text-[8.5px] block">{lab.test}{lab.unit ? ` ${lab.unit}` : ""}</span><b>{lab.value}</b></div>
          ))}
        </div>
      ) : <Blank width="170mm" />}

      <SecTitle>{L.secInstrumental}</SecTitle>
      <div>{L.ecg} <Blank width="70mm" /> {L.imaging} <Blank width="50mm" /></div>

      <SecTitle>{L.secAirway}</SecTitle>
      <div className="space-y-0.5">
        <div>{L.mouthOpening}: <Value>{p?.mouthOpeningCm ? `${p.mouthOpeningCm} cm` : null}</Value> · {L.thyromental}: <Value>{p?.thyromental ? `${p.thyromental} cm` : null}</Value> · Mallampati: <Value>{p?.mallampati ? displayClinicalCode("option:MALLAMPATI", p.mallampati, locale) : null}</Value></div>
        <div>{L.neck}: <Value>{p?.neckMobility ? displayClinicalCode("option:NECK_MOBILITY", p.neckMobility, locale) : null}</Value> · {L.ulbt}: <Value>{p?.upperLipBiteTest ? displayClinicalCode("option:UPPER_LIP_BITE", p.upperLipBiteTest, locale) : null}</Value></div>
        <div>{L.asaRisk}: <Value>{p?.asaScore ? `${p.asaScore}${p.emergencySurgery ? "E" : ""}` : null}</Value>{facts.scores.length > 1 ? ` · ${facts.scores.filter(score => !score.startsWith("ASA")).join(" · ")}` : ""}</div>
      </div>

      <div className="break-before-page">
        <SecTitle>{L.reportTitle}</SecTitle>
        <div><Box ticked={p?.emergencySurgery === true} />{L.incompleteEmergency}</div>
        <div className="font-bold mt-1.5">{L.fastingInstr}</div>
        <div><Box ticked={solids != null} />{L.stopSolids} <Value>{solids}</Value> {L.hoursBeforeOp}</div>
        <div><Box ticked={water != null} />{L.stopWater} <Value>{water}</Value> {L.hoursBeforeOp}</div>
        <div className="font-bold mt-1.5">{L.medsInstr}</div>
        <div><Box />{L.stopMed} <Blank width="60mm" /> <Blank width="10mm" /> {L.daysBeforeOp}</div>
        <div><Box />{L.continueMed} <Blank width="80mm" /></div>
        <div className="font-bold mt-1.5">{L.extraTitle}</div>
        <div><Box />{L.noExtra}</div>
        <div><Box />{L.consultWith} <Blank /> {L.because} <Blank width="60mm" /></div>
        <div className="font-bold mt-1.5">{L.premedTitle}</div>
        <div><Box />{L.premedMorning} <Blank width="90mm" /></div>
        <div><Box />{L.ponvProphylaxis} · <Box />{L.dvtProphylaxis}</div>
        <div className="font-bold mt-1.5">{L.indicTitle}</div>
        <div className="flex flex-wrap gap-x-3"><span><Box />{L.noContra}</span><span><Box />{L.relContra}</span><span><Box />{L.absContra}</span><span><Box ticked={p?.emergencySurgery === true} />{L.emergencyAnaesthesia}</span></div>
        <div className="font-bold mt-1.5">{L.riskTitle}</div>
        <div className="flex flex-wrap gap-x-3"><span><Box />{L.usualRisk}</span><span><Box />{L.raisedRisk}</span>{L.riskReasons.map(reason => <span key={reason}><Box />{reason}</span>)}</div>
        {facts.plannedText ? <Line label={L.plannedAnaesthesia} value={facts.plannedText} /> : <PenLine label={L.plannedAnaesthesia} width="34mm" />}
        <div className="flex items-end gap-3 mt-4">
          <span>{L.anaesthetist}:</span><b>{facts.consultant ?? ""}</b>{facts.consultedAt ? <span className="text-slate-500">{facts.consultedAt}</span> : null}
          <span className="ml-auto">{L.signature}</span><Blank width="45mm" />
        </div>
        <div className="flex items-end gap-3 mt-1.5">
          <span>{L.handedTo}:</span>{facts.handedOn ? <b>{facts.handedOn}</b> : <Blank width="60mm" />}
        </div>
        <div className="mt-3 text-[9px] text-slate-400">LOSPOR{data.caseCode ? ` · ${L.caseLbl} ${data.caseCode}` : ""} · {L.printed} {facts.printedText}</div>
      </div>
    </div>
  )
}
