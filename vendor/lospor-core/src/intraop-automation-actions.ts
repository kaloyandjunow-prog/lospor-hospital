/**
 * Stable identities for actions produced by intraoperative automation.
 *
 * These ids are deliberately deterministic. The event log is append-only and
 * versioned, so a retry with the same action id becomes an idempotent replay
 * instead of a second clinical action.
 */

const safePart = (value: string): string => value
  .trim()
  .replace(/[^a-zA-Z0-9._:-]+/g, "-")
  .replace(/^-+|-+$/g, "")

export const automationActionId = (...parts: string[]): string =>
  parts.map(safePart).filter(Boolean).join(":")

export const successionDismissalEventId = (suggestionId: string): string =>
  automationActionId("automation", "succession-dismiss", suggestionId)

export const contextAnswerEventId = (automationId: string, sourceId: string): string =>
  automationActionId("automation", "context-answer", automationId, sourceId)

export const monitoringDismissalEventId = (field: string, occurrence: string): string =>
  automationActionId("automation", "monitor-dismiss", field, occurrence)

export type ClinicalRelation =
  | "epidural-placement"
  | "peripheral-block"
  | "spinal-placement"
  | "anaesthesia-technique"
  | "airway-record"
  | "vascular-access"

export const clinicalRelationForEventLabel = (label: string | undefined): ClinicalRelation | null => {
  if (label === "Epidural in") return "epidural-placement"
  if (label === "Block done") return "peripheral-block"
  if (label === "Spinal in" || label === "CSE") return "spinal-placement"
  if ([
    "Intubated", "Reintubation", "Airway exchange", "LMA in", "DLT placed", "Mask vent",
    "OPA in", "NPA in", "Endobronchial tube in", "Surgical airway in", "Airway device in",
    "Cricothyrotomy", "Needle cricothyrotomy",
  ].includes(label ?? "")) return "airway-record"
  if (["IV line in", "Art line in", "CVC in", "PICC"].includes(label ?? "")) return "vascular-access"
  if (["Induction", "Sedation started"].includes(label ?? "")) return "anaesthesia-technique"
  return null
}
