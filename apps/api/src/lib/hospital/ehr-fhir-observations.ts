import "server-only"

import { resolveLabTest, type SiteLabCodeMap } from "@lospor/core/ehr-lab-codes"

/**
 * Read a hospital's laboratory results out of a FHIR Bundle.
 *
 * This is the only place that knows what an `Observation` looks like. Core's
 * canonical format is deliberately dialect-free — nothing past this point can
 * tell whether a result arrived over FHIR, a folder drop or HL7 — so every
 * awkward thing about the resource has to be resolved here or not at all.
 *
 * Three of those are not obvious, and each is a way to lose clinical data
 * quietly:
 *
 *   A result carries a status, and one of its values means the laboratory
 *   retracted it. Importing an `entered-in-error` result is worse than
 *   importing nothing, because it arrives looking exactly as trustworthy as the
 *   rest.
 *
 *   A blood gas is usually one Observation with pH, PaCO₂, PaO₂ and base excess
 *   as *components*, not four separate resources. A reader that looks only at
 *   the top-level value imports nothing at all from an arterial blood gas and
 *   raises no error doing it.
 *
 *   Not every result is a number. "Positive", "no growth after 48h", a titre, or
 *   a reason the value is absent are all real findings, and a mapper that
 *   accepts only `valueQuantity` silently drops them.
 */

/** What FHIR calls a coded value, as much of it as we read. */
type Coding = { system?: string; code?: string; display?: string }
type CodeableConcept = { coding?: Coding[]; text?: string }

type Quantity = { value?: number; unit?: string; code?: string; comparator?: string }

type ObservationLike = {
  resourceType?: string
  status?: string
  code?: CodeableConcept
  effectiveDateTime?: string
  effectiveInstant?: string
  effectivePeriod?: { start?: string; end?: string }
  issued?: string
  valueQuantity?: Quantity
  valueString?: string
  valueBoolean?: boolean
  valueInteger?: number
  valueCodeableConcept?: CodeableConcept
  valueRange?: { low?: Quantity; high?: Quantity }
  valueRatio?: { numerator?: Quantity; denominator?: Quantity }
  dataAbsentReason?: CodeableConcept
  component?: ObservationLike[]
  interpretation?: CodeableConcept[]
}

/**
 * Statuses whose results are offered to the clinician.
 *
 * `preliminary` is included deliberately. A preliminary haemoglobin at 07:30 is
 * the number the anaesthetist has, and withholding it until the laboratory
 * finalises helps nobody — it is carried with its status so the screen can say
 * so, and a later corrected value arrives as a new result rather than
 * overwriting it.
 *
 * `entered-in-error` and `cancelled` are excluded, and that is the point of
 * having this list at all: a retracted result is not a stale result, it is one
 * the laboratory has said should never have existed.
 */
const IMPORTABLE_STATUSES = new Set(["preliminary", "final", "amended", "corrected"])

/** Statuses that mean the laboratory has withdrawn the result. */
const RETRACTED_STATUSES = new Set(["entered-in-error", "cancelled"])

export type MappedObservation = {
  test: string
  reportedTest?: string
  value: string
  unit?: string
  takenAt: string | null
  /** Carried so the review screen can mark a result the laboratory may still change. */
  preliminary?: true
}

export type ObservationMappingResult = {
  values: MappedObservation[]
  /** Retracted or unreadable resources, counted so a site can see them. */
  skipped: { retracted: number; unreadable: number; noValue: number }
  /** Codings nothing could place, for the mapping screen's "map these" list. */
  unmapped: { system: string; code: string; display: string; count: number }[]
}

function text(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/**
 * When the specimen was taken, in the order FHIR means them.
 *
 * `issued` is deliberately last and only as a period fallback: it is when the
 * laboratory released the result, which for a send-out assay can be days after
 * the draw. Dating a result by when it was reported is the same error as dating
 * it by when the message arrived.
 */
function drawnAt(observation: ObservationLike): string | null {
  const stated = observation.effectiveDateTime
    ?? observation.effectiveInstant
    ?? observation.effectivePeriod?.start
  if (!stated) return null
  const parsed = new Date(stated)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/**
 * The value, whatever shape FHIR chose to put it in.
 *
 * Returns the value as a string in every case, because that is what a canonical
 * result carries: a haemoglobin and a "no growth after 48 hours" are both
 * findings, and only one of them is a number.
 */
function readValue(node: ObservationLike): { value: string; unit?: string } | null {
  const quantity = node.valueQuantity
  if (quantity && typeof quantity.value === "number" && Number.isFinite(quantity.value)) {
    // A comparator is part of the finding, not decoration: "<0.01" and "0.01"
    // are different results, and dropping the sign invents a precision the
    // laboratory refused to claim.
    const comparator = text(quantity.comparator) ?? ""
    return {
      value: `${comparator}${quantity.value}`,
      // Prefer the UCUM code over the display text. The code is the
      // machine-readable one and is what the unit conversion table is written
      // against; `unit` is free text and may be anything a laboratory prints.
      unit: text(quantity.code) ?? text(quantity.unit),
    }
  }
  if (typeof node.valueString === "string") {
    const value = text(node.valueString)
    return value ? { value } : null
  }
  if (typeof node.valueBoolean === "boolean") {
    return { value: node.valueBoolean ? "true" : "false" }
  }
  if (typeof node.valueInteger === "number" && Number.isFinite(node.valueInteger)) {
    return { value: String(node.valueInteger) }
  }
  const coded = node.valueCodeableConcept
  if (coded) {
    const value = text(coded.text) ?? text(coded.coding?.[0]?.display) ?? text(coded.coding?.[0]?.code)
    if (value) return { value }
  }
  const range = node.valueRange
  if (range) {
    const low = typeof range.low?.value === "number" ? String(range.low.value) : ""
    const high = typeof range.high?.value === "number" ? String(range.high.value) : ""
    if (low || high) {
      return {
        value: low && high ? `${low}–${high}` : low ? `>${low}` : `<${high}`,
        unit: text(range.low?.code ?? range.high?.code ?? range.low?.unit ?? range.high?.unit),
      }
    }
  }
  const ratio = node.valueRatio
  if (ratio && typeof ratio.numerator?.value === "number" && typeof ratio.denominator?.value === "number") {
    return { value: `${ratio.numerator.value}:${ratio.denominator.value}` }
  }
  // No value, but possibly a reason for its absence — "specimen haemolysed" is
  // a finding an anaesthetist acts on, and is not the same as silence.
  const absent = node.dataAbsentReason
  if (absent) {
    const reason = text(absent.text) ?? text(absent.coding?.[0]?.display)
    if (reason) return { value: reason }
  }
  return null
}

/**
 * One Observation may describe several results.
 *
 * A blood gas panel is the ordinary case: a single resource whose own code
 * names the panel and whose components carry pH, PaCO₂, PaO₂ and base excess.
 * The components are read as results in their own right, and the parent only if
 * it carries a value of its own — a panel header with no value is a container,
 * not a finding.
 */
function findings(observation: ObservationLike): { node: ObservationLike; code: CodeableConcept | undefined }[] {
  const parts: { node: ObservationLike; code: CodeableConcept | undefined }[] = []
  const own = readValue(observation)
  if (own) parts.push({ node: observation, code: observation.code })
  for (const component of observation.component ?? []) {
    if (readValue(component)) parts.push({ node: component, code: component.code })
  }
  return parts
}

/** Walk a Bundle, or accept a bare list of resources. */
function resourcesOf(payload: unknown): ObservationLike[] {
  if (Array.isArray(payload)) return payload as ObservationLike[]
  if (!payload || typeof payload !== "object") return []
  const bundle = payload as { entry?: { resource?: ObservationLike }[]; resourceType?: string }
  if (Array.isArray(bundle.entry)) {
    return bundle.entry.flatMap(entry => entry?.resource ? [entry.resource] : [])
  }
  return bundle.resourceType === "Observation" ? [payload as ObservationLike] : []
}

export function mapFhirObservations(
  payload: unknown,
  options: { siteMap?: SiteLabCodeMap } = {},
): ObservationMappingResult {
  const values: MappedObservation[] = []
  const skipped = { retracted: 0, unreadable: 0, noValue: 0 }
  const unmappedByKey = new Map<string, { system: string; code: string; display: string; count: number }>()

  for (const resource of resourcesOf(payload)) {
    if (resource?.resourceType !== "Observation") continue

    const status = text(resource.status)?.toLowerCase()
    if (status && RETRACTED_STATUSES.has(status)) { skipped.retracted += 1; continue }
    // An unrecognised status is refused rather than assumed final. FHIR's list
    // is closed, so anything outside it means we are reading something we do
    // not understand.
    if (!status || !IMPORTABLE_STATUSES.has(status)) { skipped.unreadable += 1; continue }

    const parts = findings(resource)
    if (parts.length === 0) { skipped.noValue += 1; continue }

    const takenAt = drawnAt(resource)
    for (const part of parts) {
      const read = readValue(part.node)
      if (!read) continue
      const resolved = resolveLabTest(part.code?.coding, {
        siteMap: options.siteMap,
        text: part.code?.text,
      })
      if (resolved.unmapped && resolved.unresolved) {
        const key = `${resolved.unresolved.system}|${resolved.unresolved.code}`
        const seen = unmappedByKey.get(key)
        if (seen) seen.count += 1
        else unmappedByKey.set(key, { ...resolved.unresolved, count: 1 })
      }
      const reportedTest = text(part.code?.text)
        ?? text(part.code?.coding?.[0]?.display)
        ?? text(part.code?.coding?.[0]?.code)

      values.push({
        test: resolved.test,
        ...(reportedTest && reportedTest !== resolved.test ? { reportedTest } : {}),
        value: read.value,
        ...(read.unit ? { unit: read.unit } : {}),
        // A component inherits the specimen's draw time from its parent; it has
        // no separate one, and inventing one per component would scatter a
        // single blood gas across the timeline.
        takenAt: drawnAt(part.node) ?? takenAt,
        ...(status === "preliminary" ? { preliminary: true as const } : {}),
      })
    }
  }

  return {
    values,
    skipped,
    unmapped: [...unmappedByKey.values()].sort((a, b) => b.count - a.count),
  }
}
