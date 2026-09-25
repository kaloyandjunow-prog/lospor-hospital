import { apiJson } from "./api"

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
 * drafts always save. A read that fails (offline in theatre) reports nothing
 * missing: this gate must never keep a clinician out of the intraop record.
 */
export async function fetchMissingRequiredPreop(caseId: string): Promise<MissingRequiredPreopQuestion[]> {
  try {
    const body = await apiJson<{ preopRequiredMissing?: unknown }>(`/api/cases/${encodeURIComponent(caseId)}`)
    return Array.isArray(body.preopRequiredMissing) ? body.preopRequiredMissing.filter(isMissingQuestion) : []
  } catch {
    return []
  }
}

/** Same shape as the form's own "complete the following" notice, one question per line. */
export function missingRequiredPreopMessage(
  missing: MissingRequiredPreopQuestion[],
  language: string,
  intro: string,
): string {
  const labels = missing.map(question => `- ${language === "bg" ? question.labelBg : question.labelEn}`)
  return `${intro}\n\n${labels.join("\n")}`
}
