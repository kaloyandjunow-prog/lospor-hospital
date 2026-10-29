import { summaryFacts, type PreopSummaryData } from "./facts"
import { Blank } from "./parts"

const CHILD_CATEGORIES = ["SOLID_FOOD_OR_COW_MILK", "INFANT_FORMULA_UNDER_1_YEAR", "BREAST_MILK", "CLEAR_FLUIDS"]
const ADULT_CATEGORIES = ["SOLID_FOOD_OR_COW_MILK", "CLEAR_FLUIDS"]

/**
 * Layout E, the page that goes home: large type, for a patient or parent at
 * the kitchen table the night before. The fasting hours are the child's
 * nil-by-mouth assignment when there is one; the clock times are written in
 * by hand, because LOSPOR does not know the planned start of the operation.
 */
export function PatientCopySheet({ data, locale, printedAt }: { data: PreopSummaryData; locale: string; printedAt: Date }) {
  const facts = summaryFacts(data, locale, printedAt)
  const { L } = facts
  const assigned = new Map(facts.fasting.map(row => [row.category, row.hoursBefore]))
  const categories = facts.child
    ? (assigned.size > 0 ? CHILD_CATEGORIES.filter(category => assigned.has(category)) : CHILD_CATEGORIES)
    : ADULT_CATEGORIES
  const label = (category: string) => facts.child ? L.fastingCategories[category] : L.adultFasting[category]

  return (
    <div className="preop-patient-copy bg-white text-slate-900 text-[13px] leading-relaxed" data-testid="preop-patient-copy">
      <div className="flex justify-between gap-3 text-[10px] text-slate-500 border-b border-slate-300 pb-1">
        <span>{facts.institution}</span>
        <span className="font-semibold uppercase tracking-[0.1em]">{facts.child ? L.parentCopy : L.patientCopy}</span>
      </div>
      <h2 className="text-[20px] font-bold mt-3 mb-2">{facts.child ? L.prepTitleChild : L.prepTitleAdult}</h2>
      <p className="text-[14px]">{L.operationOn}: <Blank width="45mm" /> {L.atTime} <Blank width="18mm" /> {L.hoursShort}</p>
      <p className="mt-2">{L.keepTimes}</p>

      <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] border-b-2 border-slate-900 mt-5 mb-1">{L.lastIntake}</h3>
      <div className="border-2 border-slate-900" data-testid="preop-patient-fasting">
        {categories.map(category => {
          const hours = assigned.get(category)
          return (
            <div key={category} className="grid grid-cols-[1fr_32mm_48mm] items-end gap-3 border-b border-slate-300 last:border-b-0 px-3 py-2.5">
              <span className="font-semibold text-[14px]">{label(category)}</span>
              <span className="text-[13px]">{hours != null ? L.npoHours.replace("{hours}", String(hours)) : <Blank width="20mm" />}</span>
              <span>{L.lastIntakeAt} <Blank width="22mm" /> {L.hoursShort}</span>
            </div>
          )
        })}
      </div>

      <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] border-b-2 border-slate-900 mt-5 mb-1">{facts.child ? L.medsTitleChild : L.medsTitleAdult}</h3>
      <div className="space-y-2">
        {/* What the anaesthetist instructed, in the patient's words; the dotted line is left for anything added by hand. */}
        <div data-testid="preop-patient-take">{L.takeMorning}
          {facts.medicationOrders.keep.length > 0 ? <p className="font-semibold text-[14px]">{facts.medicationOrders.keep.join(", ")}</p> : null}
          <div className="border-b border-dotted border-slate-500 h-[8mm]" />
        </div>
        <div data-testid="preop-patient-stop">{L.doNotTake}
          {facts.medicationOrders.stop.map((row, index) => <p key={index} className="font-semibold text-[14px]">{row.drug}{row.hours ? ` — ${L.stopFrom.replace("{hours}", row.hours)}` : ""}</p>)}
          {facts.medicationOrders.others.map((text, index) => <p key={`o${index}`} className="font-semibold text-[14px]">{text}</p>)}
          <div className="border-b border-dotted border-slate-500 h-[8mm]" />
        </div>
      </div>

      <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] border-b-2 border-slate-900 mt-5 mb-1">{L.bringTitle}</h3>
      <ul className="list-disc pl-6">
        {(facts.child ? L.bringChild : L.bringAdult).map(item => <li key={item}>{item}</li>)}
      </ul>
      <p className="mt-5 font-semibold">{L.questionsLine}</p>
      <div className="mt-6 text-[9px] text-slate-400">LOSPOR{data.caseCode ? ` · ${L.caseLbl} ${data.caseCode}` : ""} · {L.printed} {facts.printedText}</div>
    </div>
  )
}
