import type { AirwayDeviceEntry } from "./airway-device-entries"
import type { EquipmentCategory, EquipmentItem } from "./equipment"

/**
 * Smart selection for the Equipment tab (10.2.0): calculated guidance with a
 * small preparation reference, while clinical state comes from the canonical
 * Airway and monitoring records.
 *
 * The two airway size suggestions and the two presence flags are shown as
 * "suggested vs recorded". Only an explicit action writes clinical data. The
 * remaining rows are preparation/reference items and never masquerade as a
 * clinical record.
 *
 * Which item does what lives here so the web app and the phone cannot drift.
 */

export type EquipmentTarget =
  | { kind: "airway"; device: "ORAL_ETT" | "LMA" }
  | { kind: "flag"; field: "urinaryCatheter" | "stomachTube" }

/** The calculator item labels that write to the case. */
const TARGETS: Readonly<Record<string, EquipmentTarget>> = Object.freeze({
  "ETT size": { kind: "airway", device: "ORAL_ETT" },
  "LMA size": { kind: "airway", device: "LMA" },
  "Urinary catheter": { kind: "flag", field: "urinaryCatheter" },
  "NGT": { kind: "flag", field: "stomachTube" },
})

export const equipmentTarget = (label: string): EquipmentTarget | null => TARGETS[label] ?? null

/** The calculator leaves a size to the clinician in these words; such an item cannot be written for them. */
export const equipmentNeedsChoice = (value: string): boolean => /manual|measure|select|calculate|required|prepare a curved/i.test(value)

/** The six items shown as the glance grid, in the order a clinician reaches for them. */
export const EQUIPMENT_GLANCE: readonly string[] = Object.freeze(["ETT size", "ETT depth (lip)", "LMA size", "Laryngoscope", "Guedel OPA", "Suction catheter"])

export const equipmentItemKey = (category: string, label: string): string => `${category}|${label}`

export type EquipmentGroup = { cat: string; color?: string; items: EquipmentItem[]; difficultAirway: boolean }

/** The groups in screen order: the difficult-airway group first when the exam calls for it, and the glance items taken out of Airway. */
export function equipmentGroups(categories: readonly EquipmentCategory[]): EquipmentGroup[] {
  const groups = categories.map(category => ({
    cat: category.cat,
    color: category.color,
    difficultAirway: category.cat === "Difficult Airway",
    items: category.cat === "Airway" ? category.items.filter(item => !EQUIPMENT_GLANCE.includes(item.label)) : [...category.items],
  })).filter(group => group.items.length > 0)
  return [...groups.filter(group => group.difficultAirway), ...groups.filter(group => !group.difficultAirway)]
}

export type EquipmentFlagState = { urinaryCatheter: boolean; stomachTube: boolean }

export type EquipmentPreparedState = Readonly<Record<string, boolean>>

export type EquipmentRecordState = {
  flags: EquipmentFlagState
  /** Prefer the complete entries so size/cuff agreement can be shown. */
  airwayEntries?: readonly AirwayDeviceEntry[]
  /** Backwards-compatible fallback for callers that only have the device codes. */
  airwayInUse?: readonly string[]
  prepared?: EquipmentPreparedState
}

export type EquipmentSuggestionStatus =
  | "matched"
  | "recorded_incomplete"
  | "different"
  | "not_recorded"
  | "prepared"
  | "reference"

/** Items for which the Smart tab can compare a calculation with a canonical record. */
export const EQUIPMENT_TRACKED_LABELS: readonly string[] = Object.freeze([
  "ETT size", "LMA size", "Urinary catheter", "NGT",
])

export const equipmentIsTracked = (label: string): boolean => EQUIPMENT_TRACKED_LABELS.includes(label)

const numeric = (value: string): number | null => {
  const match = value.match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

function expectedTubeSize(value: string, cuffed: boolean | null): number | null {
  const pair = value.match(/(\d+(?:\.\d+)?)\s*cuffed\s*\/\s*(\d+(?:\.\d+)?)\s*uncuffed/i)
  if (pair) return numeric(cuffed === false ? pair[2]! : pair[1]!)
  return numeric(value)
}

function actualEntry(label: string, entries: readonly AirwayDeviceEntry[]): AirwayDeviceEntry | null {
  const devices = label === "ETT size" ? ["ORAL_ETT", "NASAL_ETT"] : label === "LMA size" ? ["LMA"] : []
  return [...entries].reverse().find(entry => entry.status === "in_use" && devices.includes(entry.device)) ?? null
}

/** A short, non-localised value for the actual record; clients localise the labels around it. */
export function equipmentRecordedValue(label: string, record: EquipmentRecordState): string | null {
  if (label === "Urinary catheter") return record.flags.urinaryCatheter ? "Documented" : null
  if (label === "NGT") return record.flags.stomachTube ? "Documented" : null
  const entries = record.airwayEntries ?? []
  const entry = actualEntry(label, entries)
  if (!entry) {
    const inUse = record.airwayInUse ?? []
    return label === "ETT size" && (inUse.includes("ORAL_ETT") || inUse.includes("NASAL_ETT")) ? "Documented" :
      label === "LMA size" && inUse.includes("LMA") ? "Documented" : null
  }
  const details = entry.details as Record<string, unknown>
  const size = label === "LMA size" ? details.lmaSize : details.oralTubeSize ?? details.nasalTubeSize
  if (typeof size !== "number" && typeof size !== "string") return "Documented"
  const cuffed = details.oralCuffed ?? details.nasalCuffed
  return `${size}${typeof cuffed === "boolean" ? (cuffed ? " cuffed" : " uncuffed") : ""}`
}

/**
 * Compare a calculator suggestion to the canonical record. A missing size or
 * cuff flag is deliberately incomplete, never a false green match.
 */
export function equipmentSuggestionStatus(label: string, value: string, record: EquipmentRecordState): EquipmentSuggestionStatus {
  const target = equipmentTarget(label)
  if (target?.kind === "flag") return record.flags[target.field] ? "recorded_incomplete" : "not_recorded"
  if (target?.kind === "airway") {
    const entries = record.airwayEntries ?? []
    const entry = actualEntry(label, entries)
    const hasFallback = (record.airwayInUse ?? []).includes(target.device)
    if (!entry && !hasFallback) return "not_recorded"
    if (!entry) return "recorded_incomplete"
    const details = entry.details as Record<string, unknown>
    const rawSize = target.device === "LMA" ? details.lmaSize : details.oralTubeSize ?? details.nasalTubeSize
    const rawCuffed = target.device === "LMA" ? null : details.oralCuffed ?? details.nasalCuffed
    const actualSize = typeof rawSize === "number" ? rawSize : typeof rawSize === "string" && rawSize.trim() ? Number(rawSize) : null
    const actualCuffed = typeof rawCuffed === "boolean" ? rawCuffed : null
    const expectedSize = expectedTubeSize(value, actualCuffed)
    if (actualSize == null || (target.device !== "LMA" && actualCuffed == null)) return "recorded_incomplete"
    if (expectedSize == null || actualSize !== expectedSize) return "different"
    if (target.device !== "LMA" && /cuffed|uncuffed/i.test(value)) {
      const expectedCuffed = /uncuffed/i.test(value) && !/cuffed\s*\//i.test(value) ? false : /cuffed/i.test(value) ? true : null
      if (expectedCuffed != null && actualCuffed !== expectedCuffed) return "different"
    }
    return "matched"
  }
  return "reference"
}

/** The preparation state is keyed by the same stable category/label key on web and mobile. */
export function equipmentPreparationStatus(category: string, label: string, prepared: EquipmentPreparedState = {}): "prepared" | "reference" {
  return prepared[equipmentItemKey(category, label)] === true ? "prepared" : "reference"
}

/** Preparation rows exclude clinical flags/sizes and keep the reference list compact. */
export function equipmentPreparationGroups(categories: readonly EquipmentCategory[]): EquipmentGroup[] {
  const groups = categories.map(category => ({
    cat: category.cat,
    color: category.color,
    difficultAirway: category.cat === "Difficult Airway",
    // equipmentGroups removes the six glance rows for the old checklist. The
    // preparation reference needs the non-clinical glance items back.
    items: category.items.filter(item => !equipmentIsTracked(item.label)),
  }))
    .filter(group => ["Airway", "Catheters", "Difficult Airway"].includes(group.cat))
    .filter(group => group.items.length > 0)
  return groups
}

/** Non-actionable calculated values are kept as a read-only reference section. */
export function equipmentReferenceGroups(categories: readonly EquipmentCategory[]): EquipmentGroup[] {
  return equipmentGroups(categories).filter(group => ["Ventilation", "Fluids", "Monitoring"].includes(group.cat))
}

/**
 * Whether an item shows as done from the record itself: a flag item when its flag is set, an airway
 * item when that device is in use. Anything else is only ticked on the device.
 */
export function equipmentRecordState(label: string, record: { flags: EquipmentFlagState; airwayInUse: readonly string[] }): "in_use" | null {
  const target = equipmentTarget(label)
  if (!target) return null
  if (target.kind === "flag") return record.flags[target.field] ? "in_use" : null
  return record.airwayInUse.includes(target.device) ? "in_use" : null
}

/** The monitoring list with a flag item set or cleared. */
export function toggleEquipmentFlag(monitoring: readonly string[], field: "urinaryCatheter" | "stomachTube"): string[] {
  return monitoring.includes(field) ? monitoring.filter(item => item !== field) : [...monitoring, field]
}

/** What a tap on an item does, given what the item is and where it stands. */
export function equipmentTapAction(label: string, state: { ready: boolean; inUse: boolean }): "ready" | "unready" | "use" | "flag" | "unflag" | "none" {
  const target = equipmentTarget(label)
  if (target?.kind === "flag") return state.inUse ? "unflag" : "flag"
  if (target?.kind === "airway") {
    if (state.inUse) return "none"
    return state.ready ? "use" : "ready"
  }
  return state.ready ? "unready" : "ready"
}
