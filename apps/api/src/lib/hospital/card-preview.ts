import { clinicalDisplayLabel } from "@lospor/core/display"
import { resolveCard, suggestionCardFor, type ResolvedRow, type SuggestionPatient } from "@lospor/core/intraop-suggestions"

/**
 * What a clinician sees on a treatment card (10.3.0), worked out here from the same Core definition the screens
 * use, for a sample patient, so Status can show a card before a hospital decides to keep it on. Nothing is read
 * from any case: the patient is a stand-in and the "complication" is made up for the preview.
 */
export const PREVIEW_PATIENTS = {
  adult: { labelEn: "Adult, 80 kg", labelBg: "Възрастен, 80 kg", patient: { ageDays: 40 * 365, weightKg: 80, idealWeightKg: 70, sex: "MALE" } as SuggestionPatient },
  child: { labelEn: "Child, 5 years, 18 kg", labelBg: "Дете, 5 г., 18 kg", patient: { ageDays: 5 * 365, weightKg: 18, idealWeightKg: 18, sex: "FEMALE" } as SuggestionPatient },
  infant: { labelEn: "Infant, 6 months, 7 kg", labelBg: "Кърмаче, 6 месеца, 7 kg", patient: { ageDays: 183, weightKg: 7, idealWeightKg: 7, sex: "MALE" } as SuggestionPatient },
} as const
export type PreviewPatientKey = keyof typeof PREVIEW_PATIENTS

export const isPreviewPatient = (value: string): value is PreviewPatientKey => Object.hasOwn(PREVIEW_PATIENTS, value)

type Words = { en: string; bg: string }

function doseText(row: ResolvedRow): { en: string; bg: string } | null {
  const prefill = row.prefill
  if (!prefill) return null
  const what = prefill.amount === "catalogue" ? null : prefill.amount
  if (what == null) {
    return prefill.amount === "catalogue"
      ? { en: "dose from the drug's own suggestion", bg: "доза по предложението за лекарството" }
      : null
  }
  const text = `${what}${prefill.unit ? ` ${prefill.unit}` : ""}`
  return { en: text, bg: text }
}

export function cardPreview(complication: string, patientKey: PreviewPatientKey, now = Date.now()) {
  const card = suggestionCardFor(complication)
  if (!card) return null
  const sample = PREVIEW_PATIENTS[patientKey]
  const at = new Date(now).toISOString()
  const event = { id: "preview", ts: at, type: "complication" as const, label: complication }
  const resolved = resolveCard(card, { log: [event], patient: sample.patient, preop: {}, complication: event, tofMonitor: false, now })
  const words = (value: Words | undefined) => (value ? { en: value.en, bg: value.bg } : null)
  return {
    complication,
    complicationBg: clinicalDisplayLabel("complication", complication, "bg"),
    kind: resolved.kind,
    redStrip: resolved.redStrip,
    question: words(resolved.question),
    branches: resolved.branches ? { prompt: words(resolved.branches.prompt), options: resolved.branches.options.map(option => ({ id: option.id, title: words(option.title)! })) } : null,
    patient: { key: patientKey, labelEn: sample.labelEn, labelBg: sample.labelBg },
    rows: resolved.rows.map(row => ({
      id: row.id,
      kind: row.kind,
      titleEn: row.title.en,
      titleBg: row.title.bg,
      noteEn: row.note?.en ?? null,
      noteBg: row.note?.bg ?? null,
      dose: doseText(row),
      branches: row.branches ? [...row.branches] : null,
      step: row.step ?? null,
      total: row.total ?? null,
    })),
  }
}
