import "server-only"

/**
 * A value as a finite number, only when the entire input is numeric text --
 * never a prefix of it. `parseFloat` stops reading at the first character
 * that breaks the pattern and returns whatever it already parsed, so "70kg"
 * became 70: a plausible-looking, silently wrong quantity manufactured from a
 * value that was never purely numeric.
 *
 * Duplicated rather than imported: this is `@lospor/core/strict-number`
 * (added upstream after this appliance's vendored core tree was last pinned),
 * kept identical here so the fix does not wait on a re-vendor. Replace this
 * with the real import the next time `vendor/lospor-core` is updated, rather
 * than letting the two drift.
 */
function strictFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  const text = String(value ?? "").trim()
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text)) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The Observations that are not laboratory results.
 *
 * FHIR carries height, weight and blood group as Observations, exactly like a
 * haemoglobin. LOSPOR does not: they are fields on the record, with their own
 * validation and their own meaning to the calculators. Sending them through the
 * lab path would land them in `labResults`, where the catalogue has no entry for
 * them, so every one would be refused as an unsupported test — which is why a
 * FHIR site currently imports no height and no weight at all.
 *
 * This picks them out by LOINC before the rest goes to the lab reader. The codes
 * are the standard ones and are matched on code alone, ignoring the system: a
 * server that omits the LOINC system URI on a LOINC code is common, and refusing
 * those would reintroduce the problem this exists to fix.
 */

const BODY_HEIGHT = new Set([
  "8302-2",  // Body height
  "8306-3",  // Body height, lying
  "3137-7",  // Body height, measured
])
const BODY_WEIGHT = new Set([
  "29463-7", // Body weight
  "3141-9",  // Body weight, measured
  "3142-7",  // Body weight, stated
])
/** ABO group on its own, and the combined ABO+Rh panel some servers send. */
const ABO_GROUP = new Set(["883-9", "882-1", "34530-6"])
const RH_GROUP = new Set(["10331-7", "1305-2"])

export type BodyObservations = {
  heightCm?: number
  weightKg?: number
  bloodType?: "A" | "B" | "AB" | "O"
  rhFactor?: "POSITIVE" | "NEGATIVE"
}

type Coding = { system?: unknown; code?: unknown; display?: unknown }

function codesOf(resource: Record<string, unknown>): string[] {
  const concept = resource.code as { coding?: Coding[] } | undefined
  return (concept?.coding ?? [])
    .map(coding => (typeof coding?.code === "string" ? coding.code.trim() : ""))
    .filter(Boolean)
}

/**
 * `valueQuantity.value` should always be a JSON number under the FHIR spec,
 * but a malformed or buggy server can send it as a string carrying its unit
 * -- "70kg" -- and `parseFloat` used to accept that as 70, silently turning a
 * clearly-invalid quantity into a plausible-looking patient weight.
 * `strictFiniteNumber` requires the whole value to be numeric, the same rule
 * this codebase already applies to lab results.
 */
function quantity(resource: Record<string, unknown>): { value: number; unit: string } | null {
  const q = resource.valueQuantity as { value?: unknown; unit?: unknown; code?: unknown } | undefined
  const value = strictFiniteNumber(q?.value)
  if (value === null) return null
  const unit = String(q?.code ?? q?.unit ?? "").trim().toLowerCase()
  return { value, unit }
}

/**
 * Height in centimetres, converting the units a server may report.
 *
 * Metres are the trap: a height of 1.75 m stored as 1.75 cm is not a validation
 * failure at either end, it is a plausible-looking number that would silently
 * halve a body surface area. So the unit is read rather than assumed, and a
 * unit we do not recognise is dropped instead of guessed.
 */
function heightInCm(value: number, unit: string): number | null {
  if (unit === "cm" || unit === "centimeter" || unit === "centimetre") return value
  if (unit === "m" || unit === "meter" || unit === "metre") return value * 100
  if (unit === "[in_i]" || unit === "in" || unit === "inch") return value * 2.54
  return null
}

function weightInKg(value: number, unit: string): number | null {
  if (unit === "kg" || unit === "kilogram") return value
  if (unit === "g" || unit === "gram") return value / 1000
  if (unit === "[lb_av]" || unit === "lb" || unit === "pound") return value * 0.45359237
  return null
}

/** "A POSITIVE", "O-", "AB Rh(D) negative" → the two fields we store. */
function readBloodGroup(text: string): { bloodType?: BodyObservations["bloodType"]; rhFactor?: BodyObservations["rhFactor"] } {
  const upper = text.toUpperCase()
  // AB before A and B, or "AB positive" reads as an A.
  const type = /\bAB\b/.test(upper) || upper.startsWith("AB") ? "AB"
    : /\bO\b/.test(upper) || upper.startsWith("O") ? "O"
    : /\bA\b/.test(upper) || upper.startsWith("A") ? "A"
    : /\bB\b/.test(upper) || upper.startsWith("B") ? "B"
    : undefined

  const rh = /NEGATIVE|\bNEG\b|-\s*$|\(D\)\s*NEG/.test(upper) ? "NEGATIVE" as const
    : /POSITIVE|\bPOS\b|\+\s*$|\(D\)\s*POS/.test(upper) ? "POSITIVE" as const
    : undefined

  return { ...(type ? { bloodType: type } : {}), ...(rh ? { rhFactor: rh } : {}) }
}

function conceptText(resource: Record<string, unknown>): string {
  const concept = resource.valueCodeableConcept as { coding?: Coding[]; text?: unknown } | undefined
  if (typeof concept?.text === "string" && concept.text.trim()) return concept.text
  const coding = (concept?.coding ?? []).find(entry => typeof entry?.display === "string" && entry.display)
  if (typeof coding?.display === "string") return coding.display
  return typeof resource.valueString === "string" ? resource.valueString : ""
}

/**
 * Split the body measurements out of a set of Observations.
 *
 * Returns what it recognised, plus everything it did not so the caller can pass
 * that on to the lab reader untouched. The newest reading wins for each field:
 * a patient weighed on admission and again this morning has two weights, and
 * the one to dose from is today's.
 */
export function splitBodyObservations(resources: Record<string, unknown>[]): {
  body: BodyObservations
  rest: Record<string, unknown>[]
} {
  const body: BodyObservations = {}
  const rest: Record<string, unknown>[] = []
  const takenAt = new Map<keyof BodyObservations, number>()

  const effectiveMs = (resource: Record<string, unknown>): number => {
    const candidates = [
      resource.effectiveDateTime,
      (resource.effectivePeriod as { start?: unknown } | undefined)?.start,
      resource.issued,
    ]
    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue
      const parsed = Date.parse(candidate)
      if (Number.isFinite(parsed)) return parsed
    }
    // No date: treated as oldest, so a dated reading always wins over it.
    return Number.NEGATIVE_INFINITY
  }

  const keep = <K extends keyof BodyObservations>(key: K, value: BodyObservations[K], at: number) => {
    if (value === undefined) return
    const previous = takenAt.get(key)
    if (previous !== undefined && previous >= at) return
    body[key] = value
    takenAt.set(key, at)
  }

  for (const resource of resources) {
    if (resource.resourceType !== "Observation") { rest.push(resource); continue }
    const codes = codesOf(resource)
    const at = effectiveMs(resource)

    if (codes.some(code => BODY_HEIGHT.has(code))) {
      const q = quantity(resource)
      const cm = q ? heightInCm(q.value, q.unit) : null
      if (cm !== null) keep("heightCm", Math.round(cm * 10) / 10, at)
      continue
    }
    if (codes.some(code => BODY_WEIGHT.has(code))) {
      const q = quantity(resource)
      const kg = q ? weightInKg(q.value, q.unit) : null
      if (kg !== null) keep("weightKg", Math.round(kg * 10) / 10, at)
      continue
    }
    if (codes.some(code => ABO_GROUP.has(code) || RH_GROUP.has(code))) {
      const group = readBloodGroup(conceptText(resource))
      keep("bloodType", group.bloodType, at)
      keep("rhFactor", group.rhFactor, at)
      continue
    }

    rest.push(resource)
  }

  return { body, rest }
}
