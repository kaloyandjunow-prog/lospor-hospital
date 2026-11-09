import { AIRWAY_TOOLS } from "./catalog/airway-management"
import {
  AIRWAY_DEVICE_REQUIRED_FIELDS,
  airwayDeviceSummary,
  type AirwayDeviceCompletenessInput,
  type AirwayDeviceWords,
} from "./intraop-domain"

/**
 * The airway devices of a case as a list (10.2.0): each device its own entry,
 * so a tube that failed and the one that replaced it are both on the record
 * (and on the printed protocol, for reimbursement) -- "Oral ETT 8.0 ×2" reads
 * as two lines.
 *
 * Cases saved before 10.2.0 kept one set of fields per kind of device
 * (airwayDevices plus a size per kind). They read through
 * legacyAirwayDeviceEntries and are never rewritten. New saves keep those
 * fields filled from the list (legacyFieldsFromEntries), so every reader that
 * knows only them goes on working.
 */

export type AirwayDeviceStatus = "in_use" | "failed" | "replaced"

/** Why a device was exchanged: picked on the Airway exchange line, or implied by the entry that opened the picker. */
export type AirwayExchangeReason = "planned" | "failed_device" | "unplanned_extubation" | "reintubation"

export type AirwayDeviceEntry = {
  id: string
  /** The device code: LMA, ORAL_ETT, NASAL_ETT, DOUBLE_LUMEN_TUBE, ENDOBRONCHIAL_TUBE, FACE_MASK, SURGICAL_AIRWAY. */
  device: string
  /** That device's own details (size, cuff, DLT type and side). */
  details: AirwayDeviceCompletenessInput
  /** When it went in; absent on entries read from the old fields. */
  insertedAt?: string | null
  /** The clinical event that created or reconciled this entry, when known. */
  sourceEventId?: string
  status: AirwayDeviceStatus
  /** When it came out of use, for a failed or replaced device. */
  endedAt?: string | null
  /** The entry that replaced it. */
  replacedBy?: string | null
  reason?: AirwayExchangeReason | null
  /** The tools that helped place it (AIRWAY_TOOLS codes): video laryngoscopy, a bougie ... (10.2.0, Smart selection). */
  instruments?: string[]
}

/**
 * The devices with details of their own, in the order the old per-kind fields
 * are rebuilt. Any other airway management code (OPA, NPA, a face mask ...)
 * is still a device and still its own entry; it just has no details.
 */
export const AIRWAY_DEVICE_CODES = ["FACE_MASK", "LMA", "ORAL_ETT", "NASAL_ETT", "DOUBLE_LUMEN_TUBE", "ENDOBRONCHIAL_TUBE", "SURGICAL_AIRWAY"] as const

const TOOL_CODES: ReadonlySet<string> = new Set(AIRWAY_TOOLS.map(([code]) => code))

const deviceCode = (value: unknown): string | null =>
  typeof value === "string" && /^[A-Z0-9_]{1,60}$/.test(value) ? value : null

const DETAIL_KEYS = ["lmaSize", "oralTubeSize", "oralCuffed", "nasalTubeSize", "nasalCuffed", "dltType", "dltSide", "dltSize", "endobronchialSize"] as const
type DetailKey = typeof DETAIL_KEYS[number]

const fieldsFor = (device: string): readonly DetailKey[] =>
  (AIRWAY_DEVICE_REQUIRED_FIELDS as Record<string, readonly DetailKey[]>)[device] ?? []

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}

function detailsFrom(device: string, source: Record<string, unknown>): AirwayDeviceCompletenessInput {
  const details: Record<string, unknown> = {}
  for (const key of fieldsFor(device)) {
    const value = source[key]
    if (typeof value === "number" || typeof value === "boolean" || (typeof value === "string" && value.trim())) details[key] = value
  }
  return details as AirwayDeviceCompletenessInput
}

const instant = (value: unknown) => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null)

/** The stored list, with anything unreadable left out. */
export function parseAirwayDeviceEntries(value: unknown): AirwayDeviceEntry[] {
  if (!Array.isArray(value)) return []
  const entries: AirwayDeviceEntry[] = []
  for (const item of value) {
    const input = record(item)
    const id = typeof input.id === "string" && input.id ? input.id : null
    const device = deviceCode(input.device)
    if (!id || !device) continue
    const status: AirwayDeviceStatus = input.status === "failed" || input.status === "replaced" ? input.status : "in_use"
    const reason = ["planned", "failed_device", "unplanned_extubation", "reintubation"].includes(input.reason as string) ? input.reason as AirwayExchangeReason : null
    const instruments = Array.isArray(input.instruments)
      ? [...new Set(input.instruments.filter((tool): tool is string => typeof tool === "string" && TOOL_CODES.has(tool)))]
      : []
    entries.push({
      id,
      device,
      ...(instruments.length > 0 ? { instruments } : {}),
      details: detailsFrom(device, record(input.details)),
      insertedAt: instant(input.insertedAt),
      ...(typeof input.sourceEventId === "string" && input.sourceEventId ? { sourceEventId: input.sourceEventId } : {}),
      status,
      ...(status !== "in_use" ? { endedAt: instant(input.endedAt), replacedBy: typeof input.replacedBy === "string" ? input.replacedBy : null } : {}),
      ...(reason ? { reason } : {}),
    })
  }
  return entries
}

/** A case saved before 10.2.0: one entry per kind ticked, with that kind's fields, all in use. */
export function legacyAirwayDeviceEntries(intraop: Record<string, unknown>): AirwayDeviceEntry[] {
  const devices = Array.isArray(intraop.airwayDevices) ? intraop.airwayDevices.filter((value): value is string => typeof value === "string") : []
  return devices
    .filter(device => deviceCode(device) != null)
    .map(device => ({ id: `legacy-${device}`, device, details: detailsFrom(device, intraop), status: "in_use" as const }))
}

/** The list to show: the stored one, or the old fields read as one. */
export function airwayDeviceEntriesOf(intraop: Record<string, unknown>): AirwayDeviceEntry[] {
  const stored = parseAirwayDeviceEntries(intraop.airwayDeviceEntries)
  return stored.length > 0 ? stored : legacyAirwayDeviceEntries(intraop)
}

/** What happens to the device taken out: replaced after a planned exchange, failed otherwise. */
export function exchangedStatus(reason: AirwayExchangeReason): Exclude<AirwayDeviceStatus, "in_use"> {
  return reason === "planned" ? "replaced" : "failed"
}

/**
 * A new device in, the old one (if any) marked failed or replaced at that
 * time and pointing to it. Both stay on the list.
 */
export function replaceAirwayDevice(
  entries: readonly AirwayDeviceEntry[],
  outId: string | null,
  next: Omit<AirwayDeviceEntry, "status" | "reason">,
  reason: AirwayExchangeReason,
): AirwayDeviceEntry[] {
  const at = next.insertedAt ?? null
  const updated = entries.map(entry => entry.id === outId && entry.status === "in_use"
    ? { ...entry, status: exchangedStatus(reason), endedAt: at, replacedBy: next.id, reason }
    : entry)
  return [...updated, { ...next, status: "in_use", reason }]
}

/** The devices in use now, newest last: what the airway tab shows as current. */
export const airwayDevicesInUse = (entries: readonly AirwayDeviceEntry[]) => entries.filter(entry => entry.status === "in_use")

/** A tracheal tube that is currently in the airway, not a failed attempt or a
 * tube that has already been exchanged. Keep this definition in Core so the
 * Smart panels, context links and succession engine cannot disagree about
 * whether a later ETT is the first intubation or a reintubation. */
export const isTrachealTube = (device: string): boolean => device === "ORAL_ETT" || device === "NASAL_ETT"

export const hasActiveTrachealTube = (entries: readonly AirwayDeviceEntry[]): boolean =>
  airwayDevicesInUse(entries).some(entry => isTrachealTube(entry.device))

/**
 * Devices that occupy the patient's primary airway. Only one of these should
 * normally be in use at once; an exchange must mark the previous entry as
 * replaced/failed rather than leaving two primary airways active.
 *
 * Face masks and oral/nasal airways are deliberately not in this set: they are
 * support/adjunct records and may coexist with a primary device during an
 * explicitly documented transition.
 */
export const AIRWAY_PRIMARY_DEVICE_CODES: readonly string[] = Object.freeze([
  "ORAL_ETT", "NASAL_ETT", "LMA", "DOUBLE_LUMEN_TUBE", "ENDOBRONCHIAL_TUBE", "SURGICAL_AIRWAY",
])

export const isPrimaryAirwayDevice = (device: string): boolean => AIRWAY_PRIMARY_DEVICE_CODES.includes(device)

/** The active primary airway that conflicts with adding the requested device. */
export function airwayPrimaryConflict(entries: readonly AirwayDeviceEntry[], device: string): AirwayDeviceEntry | null {
  if (!isPrimaryAirwayDevice(device)) return null
  // A second entry for the same primary device is also a new placement. The
  // caller may be reopening an existing record, but a new Smart add must not
  // silently create two active placements of the same tube/LMA.
  return airwayDevicesInUse(entries).find(entry => isPrimaryAirwayDevice(entry.device)) ?? null
}

/**
 * The old per-kind fields from the list, for every reader that knows only
 * those: each kind used in the case is ticked, with the details of its
 * device in use (or, when every one of that kind failed, the last of them).
 */
export function legacyFieldsFromEntries(entries: readonly AirwayDeviceEntry[]): Record<string, unknown> {
  const fields: Record<string, unknown> = Object.fromEntries(DETAIL_KEYS.map(key => [key, null]))
  const kinds: string[] = []
  const order = [...AIRWAY_DEVICE_CODES, ...entries.map(entry => entry.device).filter(device => !(AIRWAY_DEVICE_CODES as readonly string[]).includes(device))]
  for (const device of [...new Set(order)]) {
    const ofKind = entries.filter(entry => entry.device === device)
    if (ofKind.length === 0) continue
    kinds.push(device)
    const current = [...ofKind].reverse().find(entry => entry.status === "in_use") ?? ofKind[ofKind.length - 1]!
    for (const key of fieldsFor(device)) fields[key] = (current.details as Record<string, unknown>)[key] ?? null
  }
  return { ...fields, airwayDevices: kinds }
}

/** One line per device for the summary and the printed protocol: "Oral ETT 8 cuffed · failed 10:42". */
export function airwayDeviceEntryLines(
  entries: readonly AirwayDeviceEntry[],
  words: AirwayDeviceWords & { status: (status: Exclude<AirwayDeviceStatus, "in_use">) => string; time: (iso: string) => string },
): string[] {
  return entries.map(entry => {
    const name = airwayDeviceSummary(entry.device, entry.details, words) ?? words.device(entry.device)
    if (entry.status === "in_use") return name
    return `${name} · ${words.status(entry.status)}${entry.endedAt ? ` ${words.time(entry.endedAt)}` : ""}`
  })
}

/** How many devices of each kind were used, for reimbursement: { ORAL_ETT: 2, LMA: 1 }. */
export function airwayDeviceCounts(entries: readonly AirwayDeviceEntry[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of entries) counts[entry.device] = (counts[entry.device] ?? 0) + 1
  return counts
}

/** The tools used for any device on the list, once each: what the case-level tools field holds for readers that know only it. */
export function airwayToolsFromEntries(entries: readonly AirwayDeviceEntry[]): string[] {
  return [...new Set(entries.flatMap(entry => entry.instruments ?? []))]
}
