import type { ClinicalStringKey } from "@/lib/preferences-context"

/** What a failed scan request said: an ApiError, or a raw response read into the same shape. */
export type ScanFailure = { status?: number; code?: string; message?: string }

/**
 * The message for a failed lab or monitor scan (9.14.3).
 *
 * Every failure used to read "the image could not be read", whatever the
 * server answered -- so a case without AI consent looked like a bad photo and
 * nobody could tell what to change. The server's answer decides the message;
 * anything unrecognised keeps the caller's own wording.
 */
export function aiScanFailureKey(failure: ScanFailure | unknown, fallback: ClinicalStringKey): ClinicalStringKey {
  const f = (failure && typeof failure === "object" ? failure : {}) as ScanFailure
  const status = typeof f.status === "number" ? f.status : undefined
  if (status === 0 || f.code === "NETWORK") return "aiScanOffline"
  if (status === 403 && /not enabled/i.test(f.message ?? "")) return "aiScanNeedsConsent"
  if (status === 413) return "aiScanImageTooLarge"
  if (status === 400) return "aiScanImageFormat"
  if (status === 429) return "aiScanTooMany"
  if (status === 503 && f.code === "EXTERNAL_AI_MODEL_UNAVAILABLE") return "aiScanModelUnavailable"
  if (status === 503) return "aiScanNotConfigured"
  if (status === 504) return "aiScanTimeout"
  return fallback
}

/** True when the server refused only because the case's consent has not reached it yet. */
export function isConsentRefusal(failure: unknown): boolean {
  return aiScanFailureKey(failure, "lspScanFailedMsg") === "aiScanNeedsConsent"
}
