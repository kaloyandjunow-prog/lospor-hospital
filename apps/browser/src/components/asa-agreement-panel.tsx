import { asaSuggestionRule } from "@lospor/core/asa"
import type { ResearchAsaAgreementRow } from "@lospor/core/research"
import { messages, type Locale } from "@/lib/i18n"

/**
 * How often anaesthetists chose the ASA class a suggestion rule proposed,
 * per rule. This is what decides which rules to change: a rule most
 * anaesthetists overrule downward is too harsh, one they overrule upward too
 * mild. Small groups are hidden, as everywhere in research.
 */
export function AsaAgreementPanel({ rows, locale }: { rows: readonly ResearchAsaAgreementRow[] | undefined; locale: Locale }) {
  const message = (key: keyof typeof messages["en"]) => messages[locale][key]
  const share = (count: number | null, total: number | null) =>
    count == null || !total ? message("hiddenSmallGroup") : `${Math.round((count / total) * 100)}%`
  return (
    <section className="panel" style={{ marginTop: 14 }}>
      <div className="panel-header"><h3>{message("asaAgreementTitle")}</h3></div>
      <p className="panel-body metric-note">{message("asaAgreementNote")}</p>
      {!rows?.length ? <div className="empty">{message("asaAgreementEmpty")}</div> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{message("asaRule")}</th>
                <th>{message("asaSuggestedClass")}</th>
                <th className="number">{message("asaCases")}</th>
                <th className="number">{message("asaAgreed")}</th>
                <th className="number">{message("asaChoseLower")}</th>
                <th className="number">{message("asaChoseHigher")}</th>
              </tr>
            </thead>
            <tbody>{rows.map(row => (
              <tr key={row.reasonCode}>
                <td>{asaSuggestionRule(row.reasonCode, locale)?.label ?? row.reasonCode}</td>
                <td><span className="pill info">ASA {row.suggested}</span></td>
                <td className="number">{row.cases ?? message("hiddenSmallGroup")}</td>
                <td className="number">{share(row.agreed, row.cases)}</td>
                <td className="number">{share(row.choseLower, row.cases)}</td>
                <td className="number">{share(row.choseHigher, row.cases)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}
