/**
 * The audit actions the administrator's log can be filtered by.
 *
 * The filter is a whitelist, so an action missing here is invisible in the one
 * screen built to show it — the rows still appear under "All actions", but
 * nobody can select them. Handovers are the reason that matters: who a case
 * belonged to, and who moved it, is the question asked weeks later.
 *
 * Kept out of the admin page because that page is under a size budget it had
 * already reached, and a list of strings is the wrong thing to spend it on.
 */
export const AUDIT_ACTION_OPTIONS = [
  "",
  "CASE_CREATE",
  "CASE_UPDATE",
  "CASE_DELETE",
  "AI_ADVISE",
  "CASE_TRANSFER_REQUEST",
  "CASE_TRANSFER_ACCEPT",
  "CASE_TRANSFER_DECLINE",
  "CASE_TRANSFER_CANCEL",
  "CASE_TRANSFER_ASSIGN",
] as const

/** Translation key for each action, so the labels stay beside the list. */
const LABEL_KEYS: Record<string, string> = {
  "": "admin.allActions",
  CASE_CREATE: "admin.actionCaseCreate",
  CASE_UPDATE: "admin.actionCaseUpdate",
  CASE_DELETE: "admin.actionCaseDelete",
  AI_ADVISE: "admin.actionAiAdvise",
  CASE_TRANSFER_REQUEST: "admin.actionTransferRequest",
  CASE_TRANSFER_ACCEPT: "admin.actionTransferAccept",
  CASE_TRANSFER_DECLINE: "admin.actionTransferDecline",
  CASE_TRANSFER_CANCEL: "admin.actionTransferCancel",
  CASE_TRANSFER_ASSIGN: "admin.actionTransferAssign",
}

/** Builds the visible labels from whichever translator the caller holds. */
export function auditActionLabels(translate: (key: string) => string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(LABEL_KEYS).map(([action, key]) => [action, translate(key)]),
  )
}
