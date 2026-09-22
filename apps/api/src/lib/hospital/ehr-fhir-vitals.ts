import "server-only"

import { strictFiniteNumber } from "@lospor/core/strict-number"

export const FHIR_VITAL_FIELDS = [
  "bpSystolic",
  "bpDiastolic",
  "heartRate",
  "spO2",
  "temperature",
  "respiratoryRate",
] as const

export type FhirVitalField = (typeof FHIR_VITAL_FIELDS)[number]
export type VitalCodeMap = Readonly<Record<string, FhirVitalField>>

const FIELD_BY_CODE: Record<string, FhirVitalField> = {
  "8480-6": "bpSystolic",
  "8462-4": "bpDiastolic",
  "8867-4": "heartRate",
  "9279-1": "respiratoryRate",
  "59408-5": "spO2",
  "2708-6": "spO2",
  "8310-5": "temperature",
}

const LOINC_SYSTEM = "http://loinc.org"
const IMPORTABLE_STATUSES = new Set(["preliminary", "final", "amended", "corrected"])
const RETRACTED_STATUSES = new Set(["entered-in-error", "cancelled"])

type Coding = { system?: unknown; code?: unknown; display?: unknown }
type Concept = { coding?: Coding[]; text?: unknown }
type Quantity = { value?: unknown; unit?: unknown; code?: unknown }
type Observation = Record<string, unknown>

export type UnmappedVitalCode = {
  system: string
  code: string
  display: string
  count: number
}

export type VitalObservations = Partial<Record<FhirVitalField, number>>

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function codings(resource: Observation): Coding[] {
  const code = resource.code as Concept | undefined
  return Array.isArray(code?.coding) ? code.coding : []
}

function categoryCodes(resource: Observation): string[] {
  const categories = Array.isArray(resource.category) ? resource.category as Concept[] : []
  return categories.flatMap(category => Array.isArray(category?.coding) ? category.coding : [])
    .map(coding => text(coding.code).toLowerCase())
}

function displayOf(coding: Coding, resource: Observation): string {
  const code = resource.code as Concept | undefined
  return text(coding.display) || text(code?.text) || text(coding.code)
}

function keyOf(coding: Coding): string {
  return text(coding.system) + "|" + text(coding.code)
}

function fieldFor(coding: Coding, siteMap: VitalCodeMap): FhirVitalField | undefined {
  const code = text(coding.code)
  if (!code) return undefined
  if (text(coding.system) === LOINC_SYSTEM && FIELD_BY_CODE[code]) return FIELD_BY_CODE[code]
  if (!text(coding.system) && FIELD_BY_CODE[code]) return FIELD_BY_CODE[code]
  return siteMap[keyOf(coding)]
}

function numericValue(resource: Observation): { value: number; unit: string } | null {
  const quantity = resource.valueQuantity as Quantity | undefined
  if (quantity) {
    const value = strictFiniteNumber(quantity.value)
    if (value !== null) return { value, unit: text(quantity.code) || text(quantity.unit) }
  }
  const value = strictFiniteNumber(resource.valueInteger ?? resource.valueDecimal ?? resource.valueString)
  return value === null ? null : { value, unit: "" }
}

function unitOf(unit: string): string {
  return unit.trim().toLowerCase().replace(/[°\s]/g, "")
}

function convert(field: FhirVitalField, value: number, unit: string): number | null {
  const normalized = unitOf(unit)
  if (field === "temperature") {
    if (!normalized || normalized === "cel" || normalized === "c" || normalized === "celsius") return value
    if (normalized === "[degf]" || normalized === "f" || normalized === "fahrenheit") return (value - 32) * 5 / 9
    if (normalized === "k" || normalized === "kelvin") return value - 273.15
    return null
  }
  if (field === "bpSystolic" || field === "bpDiastolic") {
    if (!normalized || normalized === "mm[hg]" || normalized === "mmhg") return value
    if (normalized === "kpa") return value * 7.50061683
    return null
  }
  if (field === "spO2") {
    if (!normalized || normalized === "%" || normalized === "percent") return value
    return null
  }
  if (!normalized || normalized === "/min" || normalized === "{beats}/min" || normalized === "bpm") return value
  return null
}

function effectiveMs(resource: Observation): number {
  const candidates = [
    resource.effectiveDateTime,
    resource.effectiveInstant,
    (resource.effectivePeriod as { start?: unknown } | undefined)?.start,
    resource.issued,
  ]
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue
    const parsed = Date.parse(candidate)
    if (Number.isFinite(parsed)) return parsed
  }
  return Number.NEGATIVE_INFINITY
}

function findings(resource: Observation): { node: Observation; coding: Coding }[] {
  const result: { node: Observation; coding: Coding }[] = []
  const own = codings(resource)
  if (numericValue(resource)) for (const coding of own) result.push({ node: resource, coding })
  for (const component of (resource.component as Observation[] | undefined) ?? []) {
    const componentCodings = codings(component)
    if (!numericValue(component)) continue
    for (const coding of componentCodings) result.push({ node: component, coding })
  }
  return result
}

function isVitalCategory(resource: Observation): boolean {
  return categoryCodes(resource).some(code => code === "vital-signs" || code === "vital-sign")
}

/**
 * Remove vitals from the laboratory stream and return the newest valid value
 * for each PREOP scalar. Unknown codes are removed only when FHIR explicitly
 * says the Observation is a vital sign; they then appear in Status for a
 * one-time local HIS mapping instead of being guessed as laboratory tests.
 */
export function splitVitalObservations(
  resources: Observation[],
  siteMap: VitalCodeMap = {},
): { vitals: VitalObservations; rest: Observation[]; unmapped: UnmappedVitalCode[] } {
  const vitals: VitalObservations = {}
  const takenAt = new Map<FhirVitalField, number>()
  const rest: Observation[] = []
  const unmappedByKey = new Map<string, UnmappedVitalCode>()

  const keepUnmapped = (coding: Coding, resource: Observation) => {
    const code = text(coding.code)
    if (!code) return
    const system = text(coding.system)
    const key = system + "|" + code
    const previous = unmappedByKey.get(key)
    if (previous) previous.count += 1
    else unmappedByKey.set(key, { system, code, display: displayOf(coding, resource), count: 1 })
  }

  for (const resource of resources) {
    if (resource.resourceType !== "Observation") { rest.push(resource); continue }
    const status = text(resource.status).toLowerCase()
    if (!status || RETRACTED_STATUSES.has(status) || !IMPORTABLE_STATUSES.has(status)) {
      rest.push(resource)
      continue
    }
    const parts = findings(resource)
    const categorySaysVital = isVitalCategory(resource)
    let consumed = false
    for (const part of parts) {
      const field = fieldFor(part.coding, siteMap)
      if (!field) {
        if (categorySaysVital) {
          keepUnmapped(part.coding, resource)
          consumed = true
        }
        continue
      }
      const read = numericValue(part.node)
      const value = read ? convert(field, read.value, read.unit) : null
      if (value === null) continue
      const at = effectiveMs(resource)
      if (!takenAt.has(field) || (takenAt.get(field) ?? Number.NEGATIVE_INFINITY) < at) {
        vitals[field] = field === "spO2" || field === "temperature"
          ? Math.round(value * 100) / 100
          : Math.round(value)
        takenAt.set(field, at)
      }
      consumed = true
    }
    if (!consumed) rest.push(resource)
  }

  return { vitals, rest, unmapped: [...unmappedByKey.values()].sort((a, b) => b.count - a.count) }
}
