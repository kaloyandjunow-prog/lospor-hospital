import type { ReactElement } from "react"

import type { CaseDetail } from "@/types/case-detail"

type Tag = { label?: string }

/**
 * Past history, current medications, allergies and anaesthetic history.
 *
 * One box because a clinician reads them together: what this patient already
 * has, what they are already taking, and what has gone wrong before.
 *
 * Two things about it are deliberate and easy to undo by accident. The
 * anaesthetic-history heading appears only when something sits under it — an
 * empty one would say the history was taken and was unremarkable, which is an
 * assertion this box does not make. And malignant hyperthermia has that heading
 * of its own rather than trailing the allergy list, where a bold red line read,
 * at a glance on paper, as an allergy entry.
 */
export function HistoryAndAllergiesBox({
  preop: p,
  labels: L,
  comorbidities,
  currentMedicationsText,
  allergyDetailsText,
  Chip,
}: {
  preop: CaseDetail["preop"]
  labels: Record<string, string>
  comorbidities: Tag[]
  currentMedicationsText: string | null
  allergyDetailsText: string | null
  Chip: (props: { children: string; color?: string }) => ReactElement
}) {
  return (
          <div className="border border-slate-200 rounded-lg p-2 bg-white">
            <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1">{L.histCom.toUpperCase()}</p>
            {comorbidities.length > 0 && (
              <div className="flex flex-wrap mb-1">{comorbidities.map((c, idx) => <Chip key={idx} color="amber">{c.label ?? String(c)}</Chip>)}</div>
            )}
            {currentMedicationsText && (
              <>
                <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1 mt-1.5">{L.medications.toUpperCase()}</p>
                <p className="text-[9.5px] text-slate-700 leading-snug">{currentMedicationsText}</p>
              </>
            )}
            <p className="text-[8.5px] font-bold tracking-[0.1em] text-red-800 mb-0.5 mt-1.5">{L.allergies.toUpperCase()}</p>
            {(p?.allergies || p?.latexAllergy) ? (
              <>
                {allergyDetailsText && <p className="text-[9.5px] font-bold text-red-700">{allergyDetailsText}</p>}
                {p?.latexAllergy   && <p className="text-[9px] text-red-600">{L.latexAllergy}</p>}
              </>
            ) : <p className="text-[9px] text-slate-500">{L.nkda}</p>}
            {/* Under a heading of its own. These three lines used to trail
              * the allergy list with nothing between them and it, so a bold
              * red "Malignant hyperthermia history" sat directly beneath
              * "NKDA" and read, at a glance on paper, as an allergy entry.
              *
              * The heading appears only when there is something under it —
              * an empty "Anaesthetic history" would say the history was taken
              * and unremarkable, which is the assertion this box has just
              * stopped making. */}
            {(p?.familyAnesthesiaProblems === true
              || p?.malignantHyperthermiaHistory === true
              || p?.unexplainedAnaesthesiaComplications === true) && (
              <>
                <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-0.5 mt-1.5">{L.anaestheticHistory.toUpperCase()}</p>
                {p?.malignantHyperthermiaHistory === true && (
                  <p className="text-[8.5px] font-bold text-red-700">{L.malignantHyperthermia}</p>
                )}
                {p?.unexplainedAnaesthesiaComplications === true && (
                  <p className="text-[8.5px] text-amber-700 mt-0.5">{L.unexplainedAnaesthesiaComplications}</p>
                )}
                {p?.familyAnesthesiaProblems === true && (
                  <p className="text-[8.5px] text-amber-700 mt-0.5">{L.familyHistory}</p>
                )}
              </>
            )}
          </div>
  )
}
