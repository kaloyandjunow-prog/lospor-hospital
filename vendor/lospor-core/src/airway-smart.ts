import { AIRWAY_DEVICES, AIRWAY_TOOLS } from "./catalog/airway-management"
import {
  airwayToolsFromEntries,
  legacyFieldsFromEntries,
  replaceAirwayDevice,
  type AirwayDeviceEntry,
  type AirwayExchangeReason,
} from "./airway-device-entries"
import { calcEquipment, type EquipmentInput } from "./equipment"
import {
  DLT_SIDES,
  DLT_SIZES,
  DLT_TYPES,
  ENDOBRONCHIAL_SIZES,
  ETT_SIZES,
  LMA_SIZES,
  type AirwayDeviceCompletenessInput,
} from "./intraop-domain"

/**
 * Smart selection, the airway tab that opens on what is in place (10.2.0).
 *
 * Everything that decides what the tab offers lives here, so the web app and
 * the phone cannot drift: which devices come first for the technique, the
 * size and cuff suggested for this patient (the same numbers as the equipment
 * card), what each device asks, and how a device and its time are written to
 * the case. The screens only draw it.
 */

export type AirwayPatient = Pick<EquipmentInput, "clinicalMode" | "age" | "ageYears" | "weightKg" | "heightCm" | "sex" | "bmi" | "preterm">

/* ---------- which devices come first ---------- */

export type AirwayChoices = {
  /** The devices offered first, as big cards. */
  main: string[]
  /** Every other device, behind "More devices". */
  other: string[]
  /** Whether "No airway intervention" is offered (regional or local only). */
  noIntervention: boolean
}

const DEVICE_CODES = AIRWAY_DEVICES.map(([code]) => code)

/** Airway events that Smart selection can chart without guessing at a clinical finding. */
export type AirwayClinicalEvent =
  | "Intubated" | "Reintubation" | "LMA in" | "DLT placed" | "Airway exchange"
  | "Mask vent" | "OPA in" | "NPA in" | "Endobronchial tube in" | "Surgical airway in" | "Airway device in"

/** The event-driven airway entries that open the Smart panel from the timeline. */
export const AIRWAY_EVENT_DEVICE: Readonly<Record<string, string>> = Object.freeze({
  "Intubated": "ORAL_ETT",
  "LMA in": "LMA",
  "DLT placed": "DOUBLE_LUMEN_TUBE",
})

export type AirwayClinicalEventOptions = { replaces?: boolean; priorTrachealTube?: boolean }

/** The event implied by a device chosen from the Airway tab. */
export function airwayClinicalEvent(device: string, options: AirwayClinicalEventOptions = {}): AirwayClinicalEvent | null {
  // A tube replacing an LMA is the first intubation. Reintubation requires
  // evidence that a tracheal tube was already in place; `replaces` alone only
  // tells us that some airway record was exchanged.
  if (device === "ORAL_ETT" || device === "NASAL_ETT") return options.priorTrachealTube ? "Reintubation" : "Intubated"
  if (options.replaces) return "Airway exchange"
  if (device === "LMA") return "LMA in"
  if (device === "DOUBLE_LUMEN_TUBE") return "DLT placed"
  if (device === "FACE_MASK") return "Mask vent"
  if (device === "OPA") return "OPA in"
  if (device === "NPA") return "NPA in"
  if (device === "ENDOBRONCHIAL_TUBE") return "Endobronchial tube in"
  if (device === "SURGICAL_AIRWAY") return "Surgical airway in"
  return "Airway device in"
}

/** The devices for the technique: general anaesthesia leads with the tube, the mask and the LMA; sedation with what keeps the airway open; regional or local alone with none. */
export function airwayChoices(techniques: readonly string[], availableDevices: readonly string[] = DEVICE_CODES): AirwayChoices {
  const has = (prefix: string) => techniques.some(technique => technique === prefix || technique.startsWith(`${prefix}_`))
  const general = has("GENERAL") || techniques.length === 0
  const deviceCodes = availableDevices.length > 0 ? [...new Set(availableDevices)] : DEVICE_CODES
  const preferred = general
    ? ["ORAL_ETT", "LMA", "FACE_MASK"]
    : has("SEDATION")
      ? ["FACE_MASK", "NPA", "OPA"]
      : ["FACE_MASK"]
  const main = preferred.filter(code => deviceCodes.includes(code))
  return { main, other: deviceCodes.filter(code => !main.includes(code)), noIntervention: !general && !has("SEDATION") }
}

/* ---------- what is suggested for this patient ---------- */

const firstNumber = (text: string | undefined): number | null => {
  const match = text?.match(/\d+(?:[.,]\d+)?/)
  return match ? Number(match[0].replace(",", ".")) : null
}

/** The nearest size on the list that is not above the suggestion. */
const nearest = (sizes: readonly number[], size: number): number => [...sizes].reverse().find(item => item <= size) ?? sizes[0]!

/**
 * The size and cuff to start from, from the equipment card's own guidance, so
 * the two never disagree. Under 2 years (or without an age) the tube size is
 * left for the clinician, as the card does.
 */
export function suggestedAirwayDetails(device: string, patient: AirwayPatient): AirwayDeviceCompletenessInput {
  const items = calcEquipment({ ...patient }).flatMap(category => category.items)
  const ett = items.find(item => item.label === "ETT size")
  const lma = items.find(item => item.label === "LMA size")
  if (device === "ORAL_ETT" || device === "NASAL_ETT") {
    const size = firstNumber(ett?.value)
    if (size == null || /manual|required/i.test(ett?.value ?? "")) return {}
    return device === "ORAL_ETT" ? { oralTubeSize: nearest(ETT_SIZES, size), oralCuffed: true } : { nasalTubeSize: nearest(ETT_SIZES, size), nasalCuffed: true }
  }
  if (device === "LMA") {
    const size = firstNumber(lma?.value)
    return size == null || /required/i.test(lma?.value ?? "") ? {} : { lmaSize: nearest(LMA_SIZES, size) }
  }
  return {}
}

/* ---------- what each device asks ---------- */

export type AirwayAsk =
  | { field: keyof AirwayDeviceCompletenessInput; kind: "size"; values: readonly number[] }
  | { field: keyof AirwayDeviceCompletenessInput; kind: "cuff" }
  | { field: keyof AirwayDeviceCompletenessInput; kind: "choice"; values: readonly string[] }

/** The questions the panel asks for a device, in order; none for a mask or an airway adjunct. */
export function airwayAsks(device: string): AirwayAsk[] {
  switch (device) {
    case "ORAL_ETT": return [{ field: "oralTubeSize", kind: "size", values: ETT_SIZES }, { field: "oralCuffed", kind: "cuff" }]
    case "NASAL_ETT": return [{ field: "nasalTubeSize", kind: "size", values: ETT_SIZES }, { field: "nasalCuffed", kind: "cuff" }]
    case "LMA": return [{ field: "lmaSize", kind: "size", values: LMA_SIZES }]
    case "DOUBLE_LUMEN_TUBE": return [{ field: "dltType", kind: "choice", values: DLT_TYPES }, { field: "dltSide", kind: "choice", values: DLT_SIDES }, { field: "dltSize", kind: "size", values: DLT_SIZES }]
    case "ENDOBRONCHIAL_TUBE": return [{ field: "endobronchialSize", kind: "size", values: ENDOBRONCHIAL_SIZES }]
    default: return []
  }
}

/** Whether the tools that help place a device ("How") are asked for it. */
export const airwayAsksHow = (device: string) => ["ORAL_ETT", "NASAL_ETT", "LMA", "DOUBLE_LUMEN_TUBE", "ENDOBRONCHIAL_TUBE"].includes(device)

export const AIRWAY_HOW_CODES: readonly string[] = AIRWAY_TOOLS.map(([code]) => code)

/** Tools worth putting first for this patient: a difficult airway on the preop record leads with video laryngoscopy and fibreoptic. */
export function airwayHowOrder(difficultAirway: boolean, availableTools: readonly string[] = AIRWAY_HOW_CODES): string[] {
  const first = difficultAirway ? ["VIDEO_LARY", "FOB", "AWAKE"] : []
  const toolCodes = availableTools.length > 0 ? [...new Set(availableTools)] : AIRWAY_HOW_CODES
  return [...first.filter(code => toolCodes.includes(code)), ...toolCodes.filter(code => !first.includes(code))]
}

/* ---------- when ---------- */

export type AirwayTimeChoice = "start" | "now" | "pick" | "timeline"

/** The instant a device went in: the start of anaesthesia, now, a time typed, or the timeline cell it was opened from. */
export function resolveAirwayTime(choice: AirwayTimeChoice, context: { startedAt: string | null; now: string; picked?: string | null }): string | null {
  // A missing anaesthesia start is a missing clinical fact, not permission to
  // silently chart the device at the moment the picker was opened.
  if (choice === "start") return context.startedAt
  if (choice === "now") return context.startedAt ? context.now : null
  return context.picked && Number.isFinite(Date.parse(context.picked)) ? new Date(context.picked).toISOString() : null
}

/**
 * Keys that describe the airway record inside an atomic clinical-event patch.
 * Context links sometimes combine a technique answer and an airway answer in
 * one event. Removing an airway answer must strip only these keys, otherwise a
 * "no airway intervention" action can accidentally erase the technique event.
 */
export const AIRWAY_RECORD_PATCH_KEYS: readonly string[] = Object.freeze([
  "airwayDeviceEntries", "airwayDevices", "airwayDevice", "airwayTools", "airwayEventDevice",
  "airwayNotApplicable", "tubeSize", "cuffed", "lmaSize", "oralTubeSize", "oralCuffed",
  "nasalTubeSize", "nasalCuffed", "dltType", "dltSide", "dltSize", "endobronchialSize",
])

/** Return a patch with only non-airway fields left in it. */
export function stripAirwayRecordPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...patch }
  for (const key of AIRWAY_RECORD_PATCH_KEYS) delete next[key]
  return next
}

/* ---------- writing it to the case ---------- */

export type AirwayAdd = {
  id: string
  device: string
  details: AirwayDeviceCompletenessInput
  insertedAt: string
  sourceEventId?: string
  instruments?: readonly string[]
  /** The device being taken out, with why. */
  replaces?: { id: string; reason: AirwayExchangeReason } | null
}

/** The list with the device added; a replaced one stays on it, marked failed or replaced at that time. */
export function addAirwayDevice(entries: readonly AirwayDeviceEntry[], add: AirwayAdd): AirwayDeviceEntry[] {
  const next: Omit<AirwayDeviceEntry, "status" | "reason"> = {
    id: add.id,
    device: add.device,
    details: add.details,
    insertedAt: add.insertedAt,
    ...(add.sourceEventId ? { sourceEventId: add.sourceEventId } : {}),
    ...(add.instruments && add.instruments.length > 0 ? { instruments: [...new Set(add.instruments)] } : {}),
  }
  if (add.replaces) return replaceAirwayDevice(entries, add.replaces.id, next, add.replaces.reason)
  return [...entries, { ...next, status: "in_use" }]
}

/**
 * Everything a save writes for this list: the list itself, the old per-kind
 * fields for readers that know only them, and the case-level tools (kept, and
 * joined by the tools used for any device).
 */
export function airwayRecordFields(entries: readonly AirwayDeviceEntry[], currentTools: readonly string[] = []): Record<string, unknown> {
  return {
    airwayDeviceEntries: entries,
    ...legacyFieldsFromEntries(entries),
    airwayTools: [...new Set([...currentTools, ...airwayToolsFromEntries(entries)])],
  }
}
