/**
 * The message key for a failed lab scan (9.14.3).
 *
 * The panel used to show the server's own English error text, whatever the
 * interface language, and an unreadable reply as a network error. The status
 * decides the message; anything unrecognised keeps "Scan failed".
 */
export function aiScanFailureKey(status: number, code?: string): string {
  if (status === 403) return "intraop.lab.scanFailures.consentNotSaved"
  if (status === 413) return "intraop.lab.scanFailures.imageTooLarge"
  if (status === 400) return "intraop.lab.scanFailures.imageFormat"
  if (status === 429) return "intraop.lab.scanFailures.tooMany"
  if (status === 503 && code === "EXTERNAL_AI_MODEL_UNAVAILABLE") return "intraop.lab.scanFailures.modelUnavailable"
  if (status === 503) return "intraop.lab.scanFailures.notConfigured"
  if (status === 504) return "intraop.lab.scanFailures.timeout"
  return "intraop.lab.scanFailed"
}
