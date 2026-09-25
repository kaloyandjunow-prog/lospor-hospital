/** A required question of the case's preop profile with no answer yet, as the case read reports it. */
export type MissingRequiredPreopQuestion = {
  stableKey: string
  labelEn: string
  labelBg: string
  fields: string[]
}

function isMissingQuestion(value: unknown): value is MissingRequiredPreopQuestion {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  return typeof row.stableKey === "string"
    && typeof row.labelEn === "string"
    && typeof row.labelBg === "string"
    && Array.isArray(row.fields)
}

/**
 * Required preop questions still unanswered, read after the preop has reached
 * the server. Continuing to intraop is where a required answer is enforced --
 * drafts always save. A read that fails reports nothing missing: this gate must
 * never be the thing that keeps a clinician out of the intraop record.
 */
export async function fetchMissingRequiredPreop(caseId: string): Promise<MissingRequiredPreopQuestion[]> {
  try {
    const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, { cache: "no-store" })
    if (!response.ok) return []
    const body = await response.json() as { preopRequiredMissing?: unknown }
    return Array.isArray(body.preopRequiredMissing) ? body.preopRequiredMissing.filter(isMissingQuestion) : []
  } catch {
    return []
  }
}

export function missingRequiredPreopLabels(missing: MissingRequiredPreopQuestion[], locale: string): string {
  return missing.map(question => locale === "bg" ? question.labelBg : question.labelEn).join(", ")
}
