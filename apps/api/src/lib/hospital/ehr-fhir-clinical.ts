import "server-only"

import { EHR_ITEM_SOURCE, type EhrTagValue } from "@lospor/core/ehr-import"

/**
 * Everything a FHIR server can tell us that is not a laboratory result.
 *
 * Labs earned their own module because they carry a draw time, a unit that may
 * need converting and a per-site code map. These do not: a diagnosis, an
 * allergy and a medication are all a label plus the hospital's own code, which
 * is exactly the tag shape the review screen already renders and the case
 * already stores.
 *
 * The codes are never translated here. A hospital's ICD-10 is kept verbatim as
 * `code`/`system`, and mapping it onto ours is a separate, per-site decision
 * that does not exist yet — the same shape the folder drop has always had.
 * Passing an unmapped code through as a labelled tag is honest; guessing at one
 * would put a diagnosis the hospital never made into a patient's record.
 */

type Coding = { system?: unknown; code?: unknown; display?: unknown }
type CodeableConcept = { coding?: Coding[]; text?: unknown }

function str(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/**
 * The best human label a CodeableConcept offers, and the coding behind it.
 *
 * `text` wins over a coding's `display` because it is what the clinician at the
 * far end actually wrote or chose, and a display string is often the code
 * system's own wording rather than theirs.
 */
function readConcept(concept: CodeableConcept | undefined): {
  label?: string
  code?: string
  system?: string
} {
  if (!concept) return {}
  const coding = (concept.coding ?? []).find(entry => str(entry?.code))
  return {
    label: str(concept.text) ?? str(coding?.display) ?? str(coding?.code),
    code: str(coding?.code),
    system: str(coding?.system),
  }
}

function tag(parts: { label?: string; code?: string; system?: string } & Partial<EhrTagValue>): EhrTagValue | null {
  if (!parts.label) return null
  return {
    label: parts.label,
    ...(parts.code ? { code: parts.code } : {}),
    ...(parts.system ? { system: parts.system } : {}),
    ...(parts.dose ? { dose: parts.dose } : {}),
    ...(parts.route ? { route: parts.route } : {}),
    ...(parts.frequency ? { frequency: parts.frequency } : {}),
    source: EHR_ITEM_SOURCE,
  }
}

/**
 * Conditions the hospital currently asserts.
 *
 * `clinicalStatus` of resolved or inactive is dropped: a condition the hospital
 * has marked resolved is history, and offering it as a current comorbidity
 * invites a clinician to accept something that is no longer true. A condition
 * with no clinical status at all is kept — plenty of servers omit it, and
 * treating silence as "resolved" would empty the list at those sites.
 *
 * `verificationStatus` of refuted or entered-in-error is dropped for the
 * stronger reason: the hospital is saying this is not the case.
 */
const INACTIVE_CLINICAL = new Set(["resolved", "inactive", "remission"])
const UNTRUE_VERIFICATION = new Set(["refuted", "entered-in-error"])

function statusCode(concept: CodeableConcept | undefined): string {
  return (readConcept(concept).code ?? "").toLowerCase()
}

export function mapFhirConditions(resources: Record<string, unknown>[]): EhrTagValue[] {
  const tags: EhrTagValue[] = []
  for (const resource of resources) {
    if (resource.resourceType !== "Condition") continue
    if (INACTIVE_CLINICAL.has(statusCode(resource.clinicalStatus as CodeableConcept))) continue
    if (UNTRUE_VERIFICATION.has(statusCode(resource.verificationStatus as CodeableConcept))) continue
    const mapped = tag(readConcept(resource.code as CodeableConcept))
    if (mapped) tags.push(mapped)
  }
  return tags
}

/**
 * Allergies, and the two flags that qualify them.
 *
 * `allergies` and `latexAllergy` travel with the list because a hospital saying
 * "no known allergies" is a clinical statement and an empty list is not: the
 * first means somebody asked, the second means nobody did. FHIR distinguishes
 * them properly — a Patient with no AllergyIntolerance resources is silent,
 * while the "no known allergies" negation code is an assertion — so this only
 * sets `allergies: false` when that assertion is actually present.
 */
const NO_KNOWN_ALLERGY_CODES = new Set([
  "no-known-allergy",
  "no-known-allergies",
  "716186003", // SNOMED: No known allergy
  "409137002", // SNOMED: No known drug allergy
])

const LATEX_HINTS = ["latex", "латекс"]

export function mapFhirAllergies(resources: Record<string, unknown>[]): {
  tags: EhrTagValue[]
  /** Undefined when the server said nothing either way. */
  allergies?: boolean
  latexAllergy?: boolean
} {
  const tags: EhrTagValue[] = []
  let negated = false
  let latex = false

  for (const resource of resources) {
    if (resource.resourceType !== "AllergyIntolerance") continue
    if (UNTRUE_VERIFICATION.has(statusCode(resource.verificationStatus as CodeableConcept))) continue
    if (INACTIVE_CLINICAL.has(statusCode(resource.clinicalStatus as CodeableConcept))) continue

    const concept = readConcept(resource.code as CodeableConcept)
    const code = (concept.code ?? "").toLowerCase()
    const label = concept.label ?? ""

    if (NO_KNOWN_ALLERGY_CODES.has(code)) { negated = true; continue }

    const haystack = `${label} ${code}`.toLowerCase()
    if (LATEX_HINTS.some(hint => haystack.includes(hint))) latex = true

    const mapped = tag(concept)
    if (mapped) tags.push(mapped)
  }

  return {
    tags,
    // A real allergy outranks a negation: a server carrying both is
    // contradicting itself, and the safe reading of a contradiction about an
    // allergy is that one exists.
    ...(tags.length > 0 ? { allergies: true } : negated ? { allergies: false } : {}),
    ...(latex ? { latexAllergy: true } : {}),
  }
}

/**
 * What the patient is taking, from whichever resource the server offers.
 *
 * Both MedicationStatement and MedicationRequest are read, because servers
 * differ about which one means "currently taking" and a site that exposes only
 * the other would otherwise import nothing. Duplicates are collapsed on label
 * and dose, since the same drug arriving from both is one medication.
 *
 * Dose and route travel as free text. They are what the tag list already shows
 * a clinician, and parsing a dose into a number here would be inventing
 * precision the message does not carry.
 */
export function mapFhirMedications(resources: Record<string, unknown>[]): EhrTagValue[] {
  const byKey = new Map<string, EhrTagValue>()

  for (const resource of resources) {
    const type = resource.resourceType
    if (type !== "MedicationStatement" && type !== "MedicationRequest") continue

    const status = String(resource.status ?? "").toLowerCase()
    // "intended" and "draft" are not being taken; stopped and cancelled are no
    // longer being taken. Anything else, including a server that omits status,
    // is offered and the clinician decides.
    if (["stopped", "cancelled", "entered-in-error", "draft", "intended", "not-taken"].includes(status)) continue

    const concept = readConcept(resource.medicationCodeableConcept as CodeableConcept)
    const dosage = (resource.dosage ?? resource.dosageInstruction) as
      { text?: unknown; route?: CodeableConcept }[] | undefined
    const first = Array.isArray(dosage) ? dosage[0] : undefined

    const mapped = tag({
      ...concept,
      dose: str(first?.text),
      route: readConcept(first?.route).label,
    })
    if (!mapped) continue

    const key = `${mapped.label.toLowerCase()}|${mapped.dose ?? ""}`
    if (!byKey.has(key)) byKey.set(key, mapped)
  }

  return [...byKey.values()]
}

/**
 * The scheduled operation, from an Appointment or a ServiceRequest.
 *
 * Read from whichever the site's worklist uses. This is the one imported field
 * that describes what is about to happen rather than what already has, so an
 * entry whose status says it is finished or gone is not a plan for this case.
 */
export function mapFhirPlannedProcedures(resources: Record<string, unknown>[]): EhrTagValue[] {
  const tags: EhrTagValue[] = []
  for (const resource of resources) {
    const type = resource.resourceType
    if (type !== "ServiceRequest" && type !== "Appointment") continue
    const status = String(resource.status ?? "").toLowerCase()
    if (["revoked", "entered-in-error", "cancelled", "fulfilled", "completed"].includes(status)) continue

    const concepts = type === "Appointment"
      ? ((resource.serviceType as CodeableConcept[] | undefined) ?? [])
      : [resource.code as CodeableConcept]
    for (const concept of concepts) {
      const mapped = tag(readConcept(concept))
      if (mapped) tags.push(mapped)
    }
  }
  return tags
}

/**
 * Sex, as the record stores it.
 *
 * FHIR's administrative gender is not a clinical sex, and the difference
 * matters for the calculators this feeds — ideal body weight and several risk
 * scores are computed from it. `other` and `unknown` are therefore dropped
 * rather than mapped onto one of ours: leaving the field for the anaesthetist
 * to complete is correct, and guessing would silently change a dose.
 */
export function mapFhirSex(patient: Record<string, unknown>): "MALE" | "FEMALE" | undefined {
  const gender = String(patient.gender ?? "").toLowerCase()
  if (gender === "male") return "MALE"
  if (gender === "female") return "FEMALE"
  return undefined
}

/** The birth date, for the age proposal. Never stored — see ehr-age in core. */
export function mapFhirBirthDate(patient: Record<string, unknown>): string | undefined {
  return str(patient.birthDate)
}
