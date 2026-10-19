import type { ClinicalStringKey } from "@/lib/preferences-context"

/**
 * "Oct 2026" / "окт 2026 г.": the case month as the web case page writes it.
 * The full date of a started case is in the intraop card.
 */
export function formatCaseMonth(monthYear: string, language: string): string {
  const [year, month] = monthYear.split("-").map(Number)
  if (!year || !month) return monthYear
  return new Intl.DateTimeFormat(language === "bg" ? "bg-BG" : "en-GB", { month: "short", year: "numeric" }).format(new Date(year, month - 1, 1))
}

/** The case header's short line: age, sex, ASA, month. */
export function caseMetaParts(
  caseData: { preop?: { ageYears?: number | null; sex?: string | null; asaScore?: string | null } | null; intraop?: { monthYear?: string | null } | null } | null | undefined,
  tc: (key: ClinicalStringKey) => string,
  language: string,
): string[] {
  const parts: string[] = []
  const preop = caseData?.preop
  if (preop?.ageYears != null) parts.push(`${preop.ageYears} ${tc("yearsShort")}`)
  if (preop?.sex) parts.push(preop.sex === "MALE" ? tc("sexMaleShort") : preop.sex === "FEMALE" ? tc("sexFemaleShort") : preop.sex)
  if (preop?.asaScore) parts.push(`ASA ${preop.asaScore}`)
  if (caseData?.intraop?.monthYear) parts.push(formatCaseMonth(caseData.intraop.monthYear, language))
  return parts
}
