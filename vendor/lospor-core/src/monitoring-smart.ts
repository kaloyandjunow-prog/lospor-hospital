import { automationEnabled, type IntraopAutomationSettings, type UserAutomationSwitches } from "./intraop-automation"
import type { AirwayDeviceEntry } from "./airway-device-entries"
import type { VascularLine } from "./vascular-access-lines"
import { isGeneralAnesthesiaTechnique, isTivaTechnique } from "./intraop-domain"

/**
 * Smart selection for monitoring, the tab that suggests what the case already calls for (10.2.0).
 *
 * What is suggested, and why, lives here so the web app and the phone cannot drift. Each suggestion is a
 * rule with its own switch in Status (`monitor:<field>`, under reminders). A suggestion only names a
 * monitor; adding it writes the same monitoring flag the legacy tab writes.
 */

export const STANDARD_MONITORING: readonly string[] = Object.freeze(["ecg", "spO2Monitor", "nbpMonitor"])

export type MonitoringReasonKey = "airway" | "arterialLine" | "centralLine" | "relaxant" | "tiva" | "longGeneral"
export type MonitoringSuggestion = { field: string; reason: MonitoringReasonKey; at?: string | null; key?: string }

export const MONITORING_SUGGESTION_FIELDS = ["etco2Monitor", "invasiveBP", "cvpMonitor", "tofMonitor", "bis", "tempMonitor"] as const
export const monitoringAutomationId = (field: string) => `monitor:${field}`
/** One case-scoped occurrence of a monitoring suggestion. A dismissal of one
 * airway/line episode must not suppress the same suggestion after a later
 * device or line is charted. */
export const monitoringSuggestionKey = (field: string, at?: string | null): string => `${field}:${at ?? "case"}`

/** Neuromuscular blockers, by the names the drug lists use. */
const RELAXANTS = ["rocuronium", "vecuronium", "atracurium", "cisatracurium", "succinylcholine", "suxamethonium", "mivacurium", "pancuronium"]
export const isRelaxant = (drug: string): boolean => RELAXANTS.some(name => drug.toLowerCase().includes(name))

/** How long a general anaesthetic runs before a temperature is suggested. */
export const TEMPERATURE_AFTER_MINUTES = 30

export type MonitoringContext = {
  /** Monitoring flags already ticked. */
  monitoring: readonly string[]
  techniques: readonly string[]
  airway: readonly Pick<AirwayDeviceEntry, "device" | "status" | "insertedAt">[]
  lines: readonly VascularLine[]
  /** The first neuromuscular blocker given, if any. */
  relaxantAt: string | null
  startedAt: string | null
  now: Date | string | number
  settings?: IntraopAutomationSettings | null
  user?: UserAutomationSwitches | null
  /** Suggestions the clinician hid on this case. */
  hidden?: readonly string[]
}

export function monitoringSuggestions(context: MonitoringContext): MonitoringSuggestion[] {
  const out: MonitoringSuggestion[] = []
  const on = (field: string, at?: string | null) => context.monitoring.includes(field)
    || (context.hidden ?? []).some(hidden => hidden === field || hidden === monitoringSuggestionKey(field, at))
    || !automationEnabled(context.settings, "reminders", monitoringAutomationId(field), context.user)
  const add = (field: string, reason: MonitoringReasonKey, at?: string | null) => {
    if (!on(field, at)) out.push({ field, reason, at, key: monitoringSuggestionKey(field, at) })
  }

  const tube = context.airway.find(entry => entry.device !== "FACE_MASK" && entry.status === "in_use")
  if (tube) add("etco2Monitor", "airway", tube.insertedAt)
  const artery = context.lines.find(line => !line.failed && line.site.startsWith("ART_"))
  if (artery) add("invasiveBP", "arterialLine", artery.insertedAt)
  const central = context.lines.find(line => !line.failed && line.site.startsWith("CVK_"))
  if (central) add("cvpMonitor", "centralLine", central.insertedAt)
  if (context.relaxantAt) add("tofMonitor", "relaxant", context.relaxantAt)
  if (context.techniques.some(isTivaTechnique)) add("bis", "tiva")
  const general = context.techniques.some(isGeneralAnesthesiaTechnique)
  const started = context.startedAt ? Date.parse(context.startedAt) : NaN
  if (general && Number.isFinite(started) && new Date(context.now).getTime() - started >= TEMPERATURE_AFTER_MINUTES * 60_000) add("tempMonitor", "longGeneral")
  return out
}

/**
 * Whether to ask "Turn off NIBP?": the arterial line has just been switched on while the cuff is still on.
 * Asked once, at the moment IBP is added; the clinician may keep both.
 */
export const asksNibpOff = (before: readonly string[], after: readonly string[]): boolean =>
  !before.includes("invasiveBP") && after.includes("invasiveBP") && after.includes("nbpMonitor")

/** The monitoring with the cuff switched off. */
export const withoutNibp = (monitoring: readonly string[]): string[] => monitoring.filter(field => field !== "nbpMonitor")

/** Standard monitoring is on when all three are ticked. */
export const standardMonitoringOn = (monitoring: readonly string[]): boolean => STANDARD_MONITORING.every(field => monitoring.includes(field))

export function toggleStandardMonitoring(monitoring: readonly string[]): string[] {
  return standardMonitoringOn(monitoring)
    ? monitoring.filter(field => !STANDARD_MONITORING.includes(field))
    : [...new Set([...monitoring, ...STANDARD_MONITORING])]
}

/**
 * Readings that carry a number, and how often one is due. Minutes are the defaults; Status can change them.
 * `field` is the vital the reading is entered in.
 */
export const MONITORING_READINGS: Readonly<Record<string, { vital: "bisValue" | "tofRatio" | "cvpMmHg" | "etco2" | "temp"; dueMinutes: number }>> = Object.freeze({
  bis: { vital: "bisValue", dueMinutes: 15 },
  tofMonitor: { vital: "tofRatio", dueMinutes: 10 },
  cvpMonitor: { vital: "cvpMmHg", dueMinutes: 15 },
  etco2Monitor: { vital: "etco2", dueMinutes: 15 },
  tempMonitor: { vital: "temp", dueMinutes: 30 },
})

/**
 * A reading is due when the last one (or the monitor going on) is older than the interval: the hospital's
 * (Status, `monitoringDueMinutes`) when given, else the built-in one.
 */
export function readingDue(
  field: string,
  lastAt: string | null,
  since: string | null,
  now: Date | string | number,
  dueMinutes?: Readonly<Record<string, number>> | null,
): boolean {
  const rule = MONITORING_READINGS[field]
  if (!rule) return false
  const minutes = dueMinutes?.[field] ?? rule.dueMinutes
  const from = Date.parse(lastAt ?? since ?? "")
  return Number.isFinite(from) && new Date(now).getTime() - from >= minutes * 60_000
}

/**
 * The full list, grouped by what a monitor tells you (the Legacy screen, and "More monitors" on the Smart
 * one). `short` is the name on the tile; the long name comes from the catalogue.
 */
export const MONITORING_PURPOSE_GROUPS: ReadonlyArray<{ id: "heart" | "breathing" | "brain" | "muscle" | "temperature"; fields: ReadonlyArray<{ field: string; short: string }> }> = Object.freeze([
  { id: "heart", fields: [{ field: "ecg", short: "ECG" }, { field: "nbpMonitor", short: "NIBP" }, { field: "invasiveBP", short: "IBP" }, { field: "cvpMonitor", short: "CVP" }, { field: "paCatheter", short: "PA" }, { field: "tee", short: "TEE" }] },
  { id: "breathing", fields: [{ field: "spO2Monitor", short: "SpO₂" }, { field: "etco2Monitor", short: "EtCO₂" }] },
  { id: "brain", fields: [{ field: "bis", short: "BIS" }, { field: "entropyMonitor", short: "Entropy" }, { field: "nirsMonitor", short: "NIRS" }, { field: "evokedPotentials", short: "SSEP/MEP" }] },
  { id: "muscle", fields: [{ field: "tofMonitor", short: "TOF" }] },
  { id: "temperature", fields: [{ field: "tempMonitor", short: "Temp" }, { field: "urinaryCatheter", short: "Catheter" }, { field: "stomachTube", short: "NGT" }] },
])
