"use client"

import Link from "next/link"
import { resolveClinicalDisplay } from "@lospor/core/display"
import type { ResearchCaseSummary } from "@lospor/core/research"
import { optionDisplayLabel } from "@/lib/clinical-display"
import { useLocale } from "./locale-provider"

export function CasesTable({ cases }: { cases: ResearchCaseSummary[] }) {
  const { locale, message } = useLocale()
  if (!cases.length) return <div className="empty">{message("noMatchingCases")}</div>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{message("researchId")}</th><th>{message("period")}</th><th>{message("patient")}</th>
            <th>ASA</th><th>{message("diagnosis")}</th><th>{message("procedure")}</th>
            <th>{message("technique")}</th><th>{message("duration")}</th><th>{message("outcome")}</th><th>{message("complete")}</th>
          </tr>
        </thead>
        <tbody>
          {cases.map(item => (
            <tr key={item.id}>
              <td><Link className="mono" href={`/cases/${item.id}`}>{item.researchId}</Link></td>
              <td>{item.period ?? "—"}</td>
              <td>{item.ageYears ?? "—"} · {item.sex ? optionDisplayLabel("SEX", item.sex, locale) : "—"}</td>
              <td><span className="pill info">{item.asa ?? "—"}</span></td>
              <td>
                {item.diagnosisCode && <span className="mono">{item.diagnosisCode} </span>}
                {item.diagnosis
                  ? resolveClinicalDisplay("diagnosis", item.diagnosisCode, locale, {
                      label: item.diagnosis,
                      labelEn: item.diagnosisLabelEn,
                      labelBg: item.diagnosisLabelBg,
                    }).label
                  : "—"}
              </td>
              <td>{item.procedure ?? "—"}</td>
              <td>{item.technique.map(code => optionDisplayLabel("TECHNIQUE", code, locale)).join(", ") || "—"}</td>
              <td className="number">{item.durationMinutes != null ? `${item.durationMinutes} min` : "—"}</td>
              <td>{item.complications > 0
                ? <span className="pill bad">{item.complications} {locale === "bg" ? "усложнения" : "complication"}</span>
                : <span className="pill good">{item.disposition
                    ? optionDisplayLabel("DISPOSITION", item.disposition, locale)
                    : message("noComplication")}</span>}</td>
              <td className="number">{item.completeness.toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}