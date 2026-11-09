/**
 * Changing the end of a case that has already ended (10.1.0): allowed until
 * the case is finalised, only with a stated reason, and audited. Never after
 * finalisation.
 *
 * The reasons are a fixed list rather than free text, because free text in an
 * audit record can carry patient details and the audit guard refuses it.
 */

export const INTRAOP_END_CORRECTION_REASONS = [
  "WRONG_TIME_ENTERED",
  "CHARTED_RETROSPECTIVELY",
  "ENDED_TOO_EARLY",
  "DEVICE_CLOCK",
  "OTHER",
] as const
export type IntraopEndCorrectionReason = typeof INTRAOP_END_CORRECTION_REASONS[number]

const LABELS: Record<IntraopEndCorrectionReason, { en: string; bg: string }> = {
  WRONG_TIME_ENTERED: { en: "The wrong time was entered", bg: "Въведено е грешно време" },
  CHARTED_RETROSPECTIVELY: { en: "The case is being charted after the fact", bg: "Случаят се документира впоследствие" },
  ENDED_TOO_EARLY: { en: "The case was ended too early", bg: "Случаят е приключен твърде рано" },
  DEVICE_CLOCK: { en: "The device clock was wrong", bg: "Часовникът на устройството е бил грешен" },
  OTHER: { en: "Another reason", bg: "Друга причина" },
}

export function isIntraopEndCorrectionReason(value: unknown): value is IntraopEndCorrectionReason {
  return typeof value === "string" && (INTRAOP_END_CORRECTION_REASONS as readonly string[]).includes(value)
}

export function intraopEndCorrectionReasonLabel(reason: IntraopEndCorrectionReason, locale: string): string {
  return LABELS[reason][locale === "bg" ? "bg" : "en"]
}

const instant = (value: Date | string | null | undefined): number | null => {
  if (value == null) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

/**
 * Whether a change of end is a correction that needs a reason: the case had
 * an end and gets a different one. Ending a case (no end before) and Resume
 * (the end removed) are not corrections.
 */
export function isIntraopEndCorrection(before: Date | string | null | undefined, after: Date | string | null | undefined): boolean {
  const was = instant(before)
  const now = instant(after)
  return was != null && now != null && was !== now
}
