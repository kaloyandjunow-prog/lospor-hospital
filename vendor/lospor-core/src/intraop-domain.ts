import { normalizeOptionCode } from "./option-aliases"

export const GENERAL_TECHNIQUES = [
  "GENERAL_INHALATION",
  "GENERAL_TIVA",
  "GENERAL_BALANCED",
] as const

export const NEURAXIAL_TECHNIQUE_PREFIXES = ["SPINAL", "EPIDURAL", "CSE", "DPE"] as const

export function canonicalTechnique(value: string): string {
  return normalizeOptionCode("TECHNIQUE", value)
}

export function isGeneralAnesthesiaTechnique(value: string): boolean {
  return (GENERAL_TECHNIQUES as readonly string[]).includes(canonicalTechnique(value))
}

export function isTivaTechnique(value: string): boolean {
  return canonicalTechnique(value) === "GENERAL_TIVA"
}

export function isNeuraxialTechnique(value: string): boolean {
  const canonical = canonicalTechnique(value)
  return NEURAXIAL_TECHNIQUE_PREFIXES.some(prefix =>
    canonical === prefix || canonical.startsWith(`${prefix}_`),
  )
}

export function isGeneralAnesthesiaCase(techniques: readonly string[]): boolean {
  return techniques.some(technique =>
    isGeneralAnesthesiaTechnique(technique) || /(^|\b)(ga|ett|lma|tiva)(\b|$)/i.test(technique),
  )
}

export function techniqueUsesGas(techniques: readonly string[]): boolean {
  return techniques.some(technique => {
    const canonical = canonicalTechnique(technique)
    return canonical === "GENERAL_INHALATION" || canonical === "GENERAL_BALANCED"
  })
}

/**
 * Which family a technique belongs to, for the colour a client gives it.
 *
 * The families are clinical; the colours are not, so each app keeps its own
 * palette and asks this which bucket to paint. Both apps used to classify for
 * themselves and had drifted: a peripheral block and a technique named as
 * neuraxial were coloured correctly on the web and fell through to the grey
 * "other" bucket on the phone, so the same case looked different depending on
 * which screen it was open on.
 */
export type TechniqueFamily =
  | "general"
  | "neuraxial"
  | "block"
  | "sedation"
  | "local"
  | "other"

export function techniqueFamily(technique: string): TechniqueFamily {
  const code = canonicalTechnique(technique)
  if (code.startsWith("GENERAL")) return "general"
  if (
    code.startsWith("SPINAL")
    || code.startsWith("EPIDURAL")
    || code.startsWith("CSE")
    || code.startsWith("NEURAXIAL")
    || code === "DPE"
  ) return "neuraxial"
  if (code.startsWith("BLOCK") || code.startsWith("PERIPHERAL")) return "block"
  if (code.startsWith("SEDATION")) return "sedation"
  if (code === "LOCAL") return "local"
  return "other"
}

export function techniqueNeedsRegionalBlock(techniques: readonly string[]): boolean {
  return techniques.some(technique =>
    canonicalTechnique(technique).startsWith("BLOCK_") || isNeuraxialTechnique(technique),
  )
}

/**
 * The monitoring a technique implies, which is the only thing this decides.
 *
 * It answers "this anaesthetic cannot be given without these", and every entry
 * follows from the technique itself: a general anaesthetic is capnographed and
 * its temperature watched, a neuraxial is monitored like one, TIVA gets depth
 * of anaesthesia. Ticking a box here is a claim that the monitor was used, so
 * nothing goes in that a clinician might not actually have attached.
 *
 * Urgency was briefly among them -- an emergency case pre-ticked invasive
 * arterial pressure -- and it does not belong. An arterial line is a decision
 * about this patient, taken by the person at the table, and pre-ticking it
 * documents a line that may never have been sited. Emergency surgery is also
 * the case least likely to have had time for one. It was on the web form and
 * never on the phone, so the two apps disagreed about the same case.
 */
export function requiredMonitoringFieldsForTechniques(
  techniques: readonly string[],
): string[] {
  const isGeneral = techniques.some(isGeneralAnesthesiaTechnique)
  const isTiva = techniques.some(isTivaTechnique)
  const isNeuraxial = techniques.some(isNeuraxialTechnique)
  return [...new Set([
    ...(isGeneral || isNeuraxial
      ? ["ecg", "spO2Monitor", "nbpMonitor", "etco2Monitor"]
      : []),
    ...(isGeneral ? ["tempMonitor"] : []),
    ...(isTiva ? ["bis"] : []),
  ])]
}

/** The fields to switch on, leaving alone anything already recorded. */
export function monitoringPatchForTechniques(
  techniques: readonly string[],
  current: Record<string, unknown> = {},
): Record<string, true> {
  return Object.fromEntries(
    requiredMonitoringFieldsForTechniques(techniques)
      .filter(field => current[field] !== true)
      .map(field => [field, true]),
  )
}

/**
 * The `monthYear` a case is filed under, in the stored `YYYY-MM` shape.
 *
 * A stored field's format, so it belongs with the record rather than being
 * spelled out wherever a case is created -- which is what the web form did,
 * inline, while the phone had it as a function.
 */
export function monthYearForDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

export const CORMACK_LEHANE_GRADES = ["I", "IIa", "IIb", "III", "IV"] as const
export const LMA_SIZES = [1, 1.5, 2, 2.5, 3, 4, 5] as const
export const ETT_SIZES = [
  2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10,
] as const
export const DLT_TYPES = ["Carlens", "Robertshaw"] as const
export const DLT_SIDES = ["Left", "Right"] as const
export const DLT_SIZES = [26, 28, 32, 35, 37, 39, 41] as const
export const ENDOBRONCHIAL_SIZES = ETT_SIZES

export const AIRWAY_DEVICE_REQUIRED_FIELDS = {
  LMA: ["lmaSize"],
  ORAL_ETT: ["oralTubeSize", "oralCuffed"],
  NASAL_ETT: ["nasalTubeSize", "nasalCuffed"],
  DOUBLE_LUMEN_TUBE: ["dltType", "dltSide", "dltSize"],
  ENDOBRONCHIAL_TUBE: ["endobronchialSize"],
} as const

export type AirwayDeviceWithProfile = keyof typeof AIRWAY_DEVICE_REQUIRED_FIELDS
export const AIRWAY_DEVICES_WITH_SUBOPTIONS =
  Object.keys(AIRWAY_DEVICE_REQUIRED_FIELDS) as AirwayDeviceWithProfile[]

export type AirwayDeviceCompletenessInput = {
  lmaSize?: string | number | null
  oralTubeSize?: string | number | null
  oralCuffed?: boolean | null
  nasalTubeSize?: string | number | null
  nasalCuffed?: boolean | null
  dltType?: string | null
  dltSide?: string | null
  dltSize?: string | number | null
  endobronchialSize?: string | number | null
}

function filled(value: unknown): boolean {
  return value !== null && value !== undefined && value !== ""
}

export function isAirwayDeviceComplete(
  device: string,
  input: AirwayDeviceCompletenessInput,
): boolean {
  const fields = AIRWAY_DEVICE_REQUIRED_FIELDS[device as AirwayDeviceWithProfile]
  return Boolean(fields?.every(field => filled(input[field])))
}

/**
 * How each app names the parts of a device summary.
 *
 * `device` is the app's own label for the device; `attribute` resolves the
 * clinical words -- cuffed, uncuffed, left, right -- through the shared
 * vocabulary. Both were written twice and had already drifted: one client said
 * "cuffed" from the clinical vocabulary and the other from its own copy, so the
 * same tube could read differently depending on which screen a clinician was
 * looking at.
 */
export type AirwayDeviceWords = {
  device: (code: string) => string
  attribute: (code: string) => string
}

function present(value: unknown): boolean {
  return filled(value) && !(typeof value === "string" && value.trim() === "")
}

/**
 * The one-line description of a confirmed airway device: "LMA 4", "Oral ETT
 * 7.5 cuffed", "Double lumen Carlens left 37Fr".
 *
 * `null` means there is not yet enough to describe -- the caller shows the
 * device's plain name instead. A double lumen tube is the exception and
 * describes whatever parts it has: the type, side and size arrive separately
 * while the panel is open, and a summary that stayed blank until all three
 * were in would tell the clinician nothing during the entry it exists to
 * confirm.
 */
export function airwayDeviceSummary(
  device: string,
  input: AirwayDeviceCompletenessInput,
  words: AirwayDeviceWords,
): string | null {
  const name = words.device(device)
  const cuffing = (cuffed: boolean) => words.attribute(cuffed ? "cuffed" : "uncuffed")

  switch (device) {
    case "LMA":
      return present(input.lmaSize) ? `${name} ${input.lmaSize}` : null
    case "ORAL_ETT":
      return present(input.oralTubeSize) && input.oralCuffed != null
        ? `${name} ${input.oralTubeSize} ${cuffing(input.oralCuffed)}`
        : null
    case "NASAL_ETT":
      return present(input.nasalTubeSize) && input.nasalCuffed != null
        ? `${name} ${input.nasalTubeSize} ${cuffing(input.nasalCuffed)}`
        : null
    case "DOUBLE_LUMEN_TUBE": {
      if (!present(input.dltType) && !present(input.dltSide) && !present(input.dltSize)) return null
      const type = present(input.dltType) ? ` ${input.dltType}` : ""
      const side = present(input.dltSide)
        ? ` ${words.attribute(String(input.dltSide).toLowerCase())}`
        : ""
      const size = present(input.dltSize) ? ` ${input.dltSize}Fr` : ""
      return `${name}${type}${side}${size}`
    }
    case "ENDOBRONCHIAL_TUBE":
      return present(input.endobronchialSize) ? `${name} ${input.endobronchialSize}mm` : null
    default:
      return null
  }
}

export function syncAirwayDeviceSelection(
  devices: string[],
  device: string,
  complete: boolean,
): string[] {
  const included = devices.includes(device)
  if (complete && !included) return [...devices, device]
  if (!complete && included) return devices.filter(item => item !== device)
  return devices
}

export type AirwaySectionInput = {
  airwayTools: readonly string[]
  airwayDevices: readonly string[]
  lmaSize?: string | number | null
  oralTubeSize?: string | number | null
  oralCuffed?: boolean | null
  nasalTubeSize?: string | number | null
  nasalCuffed?: boolean | null
  dltType?: string | null
  dltSide?: string | null
  dltSize?: string | number | null
  endobronchialSize?: string | number | null
  cormackLehane?: string | null
  ventilationModes: readonly string[]
  airwayNotes?: string | null
  /**
   * Why this case has no airway device of its own.
   *
   * presentsIntubated: arrived with a tracheal tube somebody else placed. This
   * does NOT mean the team did nothing -- they may exchange, re-site, ventilate
   * through or extubate that tube -- so it stays independent of the device and
   * tool lists.
   * airwayNotApplicable: no airway intervention at all. This one really does
   * exclude the rest, which is what airwayAbsentReason below enforces.
   */
  presentsIntubated?: boolean | null
  airwayNotApplicable?: boolean | null
}

/**
 * The two reasons an airway section can be empty. Independent, not exclusive.
 *
 * Kept here rather than in each client because they were previously two loose
 * booleans that web and mobile toggled with different rules, and neither could
 * see what the other did.
 *
 * They do not exclude one another, and the case that proves it is a common one:
 * a patient arrives from the ICU already intubated and ventilated, and the
 * anaesthetist does not touch the airway at all. Both statements are true at
 * once — a tube is in place, and this team performed no airway intervention —
 * and they answer different questions. `presentsIntubated` says who placed the
 * airway; `airwayNotApplicable` says whether this team did anything to it.
 *
 * Neither excludes the device and tool lists either: a patient who arrived with
 * a tube may still have it exchanged, re-sited, ventilated through or removed,
 * and that is this team's work.
 */
export function airwayAbsentReason(
  next: "presentsIntubated" | "airwayNotApplicable",
  current: { presentsIntubated?: boolean | null; airwayNotApplicable?: boolean | null },
): { presentsIntubated: boolean; airwayNotApplicable: boolean } {
  const presents = !!current.presentsIntubated
  const notApplicable = !!current.airwayNotApplicable
  return next === "presentsIntubated"
    ? { presentsIntubated: !presents, airwayNotApplicable: notApplicable }
    : { presentsIntubated: presents, airwayNotApplicable: !notApplicable }
}

function nullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function buildAirwaySectionPatch(input: AirwaySectionInput): Record<string, unknown> {
  return {
    airwayTools: [...input.airwayTools],
    airwayDevices: [...input.airwayDevices],
    lmaSize: nullableNumber(input.lmaSize),
    oralTubeSize: nullableNumber(input.oralTubeSize),
    oralCuffed: input.oralCuffed ?? null,
    nasalTubeSize: nullableNumber(input.nasalTubeSize),
    nasalCuffed: input.nasalCuffed ?? null,
    dltType: input.dltType ?? null,
    dltSide: input.dltSide ?? null,
    dltSize: nullableNumber(input.dltSize),
    endobronchialSize: nullableNumber(input.endobronchialSize),
    cormackLehane: input.cormackLehane || null,
    ventilationModes: [...input.ventilationModes],
    airwayNotes: input.airwayNotes ?? "",
    // Explicit false rather than an omitted key: an absent key is dropped from
    // a patch as "not mentioned", so a flag turned back off would silently keep
    // its previous true.
    presentsIntubated: !!input.presentsIntubated,
    airwayNotApplicable: !!input.airwayNotApplicable,
  }
}

export function vascularAccessDefaultUnit(site: string): "G" | "Fr" {
  return site.startsWith("ART_") || site === "VEN_PERIPHERAL" ? "G" : "Fr"
}

export { VASCULAR_PREEXISTING_QUICK_OPTIONS } from "./catalog/vascular-access"
