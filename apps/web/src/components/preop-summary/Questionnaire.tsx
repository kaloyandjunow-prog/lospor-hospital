import {
  groupPreopQuestionnaire,
  PREOP_QUESTIONNAIRE_SECTION_LABELS,
  preopQuestionnaireAnswerText,
  type PreopQuestionnaireItem,
} from "@lospor/core/preop-documents"
import type { PreopSummaryLabels } from "./labels"

/**
 * The whole questionnaire the clinician was shown, every answer printed:
 * "no" as well as "yes", and a dash for a question left unanswered. In the
 * form's sections, each follow-up under its question.
 *   list     two columns, the answer at the end of the line (B, C, E)
 *   compact  three columns in small type (D, the one-sheet layout)
 *   table    Document №2's yes/no columns (A); other answers are written out
 */
export function Questionnaire({ items, lang, L, variant }: {
  items: readonly PreopQuestionnaireItem[]
  lang: "en" | "bg"
  L: PreopSummaryLabels
  variant: "list" | "compact" | "table"
}) {
  const groups = groupPreopQuestionnaire(items)
  if (groups.length === 0) return null
  const sectionLabels = PREOP_QUESTIONNAIRE_SECTION_LABELS[lang]

  if (variant === "table") {
    return (
      <table className="w-full border-collapse text-[9.5px] leading-snug" data-testid="preop-questionnaire">
        <thead>
          <tr>
            <th className="border border-slate-400 px-1.5 py-0.5 text-left bg-slate-100">{L.markHint}</th>
            <th className="border border-slate-400 px-1 py-0.5 w-[10mm] bg-slate-100">{L.yes}</th>
            <th className="border border-slate-400 px-1 py-0.5 w-[10mm] bg-slate-100">{L.no}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => [
            <tr key={group.section}><td colSpan={3} className="border border-slate-400 px-1.5 py-0.5 font-bold uppercase text-[8.5px] bg-slate-100">{sectionLabels[group.section]}</td></tr>,
            ...group.rows.map(({ item, depth }) => {
              const yes = item.answer === "YES" && !item.option
              const no = item.answer === "NO"
              const other = !yes && !no && item.answer ? preopQuestionnaireAnswerText(item, lang) : null
              return (
                <tr key={item.stableKey} data-answer={item.answer ?? "NONE"}>
                  <td className={`border border-slate-400 px-1.5 py-0.5 ${depth ? "pl-5" : ""}`}>
                    {item.label[lang]}{other ? <b> — {other}</b> : null}
                  </td>
                  <td className="border border-slate-400 text-center font-bold">{yes ? "Х" : ""}</td>
                  <td className="border border-slate-400 text-center font-bold">{no ? "Х" : ""}</td>
                </tr>
              )
            }),
          ])}
        </tbody>
      </table>
    )
  }

  const compact = variant === "compact"
  return (
    <div className={`${compact ? "columns-3 text-[8.5px]" : "columns-2 text-[10px]"} gap-x-5 leading-snug`} data-testid="preop-questionnaire">
      {groups.map(group => (
        <div key={group.section} className="mb-1.5">
          <div className="break-after-avoid font-bold uppercase tracking-[0.08em] text-[0.85em] text-slate-500 border-b border-slate-200 mb-0.5">{sectionLabels[group.section]}</div>
          {group.rows.map(({ item, depth }) => {
            const answer = preopQuestionnaireAnswerText(item, lang)
            return (
              <div key={item.stableKey} className={`flex gap-2 break-inside-avoid ${depth ? "pl-3 text-slate-600" : ""}`} data-answer={item.answer ?? "NONE"}>
                <span className="min-w-0 flex-1">{depth ? "– " : ""}{item.label[lang]}</span>
                <span className={`shrink-0 text-right ${item.answer === "YES" ? "font-bold text-slate-900" : "text-slate-600"}`}>{answer}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
