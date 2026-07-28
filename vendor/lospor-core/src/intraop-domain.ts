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

export function techniqueNeedsRegionalBlock(techniques: readonly string[]): boolean {
  return techniques.some(technique =>
    canonicalTechnique(technique).startsWith("BLOCK_") || isNeuraxialTechnique(technique),
  )
}

export type MonitoringDefaultsContext = {
  emergency?: boolean
}

export function requiredMonitoringFieldsForTechniques(
  techniques: readonly string[],
  context: MonitoringDefaultsContext = {},
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
    ...(context.emergency ? ["invasiveBP"] : []),
  ])]
}

export function monitoringPatchForTechniques(
  techniques: readonly string[],
  current: Record<string, unknown> = {},
  context: MonitoringDefaultsContext = {},
): Record<string, true> {
  return Object.fromEntries(
    requiredMonitoringFieldsForTechniques(techniques, context)
      .filter(field => current[field] !== true)
      .map(field => [field, true]),
  )
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
  }
}

export function vascularAccessDefaultUnit(site: string): "G" | "Fr" {
  return site.startsWith("ART_") || site === "VEN_PERIPHERAL" ? "G" : "Fr"
}

export { VASCULAR_PREEXISTING_QUICK_OPTIONS } from "./catalog/vascular-access"
