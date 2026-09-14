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
  return splitFhirConditions(resources, new Map()).diagnoses
}

/**
 * The role each of a stay's conditions plays, keyed by Condition id.
 *
 * FHIR keeps the role on the encounter (`Encounter.diagnosis.use`), not on the
 * Condition. The codes are FHIR's diagnosis-role codes, which NHIS CL076 maps
 * to one for one (AD, DD, CC, CM, pre-op, post-op, billing); a coding in a
 * system naming CL076 carries the NHIS key instead (4 comorbidity, 7 billing).
 * R4 has one `use`; R5 has a list and names the condition as a CodeableReference.
 */
export type DiagnosisRole = "comorbidity" | "billing" | "clinical"

const NHIS_CL076: Readonly<Record<string, DiagnosisRole>> = {
  "1": "clinical", "2": "clinical", "3": "clinical", "4": "comorbidity", "5": "clinical", "6": "clinical", "7": "billing",
}
const FHIR_DIAGNOSIS_ROLE: Readonly<Record<string, DiagnosisRole>> = {
  ad: "clinical", dd: "clinical", cc: "clinical", cm: "comorbidity", "pre-op": "clinical", "post-op": "clinical", billing: "billing",
}

export function encounterDiagnosisRoles(encounter: Record<string, unknown> | null): Map<string, Set<DiagnosisRole>> {
  const roles = new Map<string, Set<DiagnosisRole>>()
  const entries = Array.isArray(encounter?.diagnosis) ? encounter.diagnosis as Record<string, unknown>[] : []
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue
    const condition = entry.condition as { reference?: unknown } | undefined
    const reference = typeof condition?.reference === "string"
      ? condition.reference
      : str((condition?.reference as { reference?: unknown } | undefined)?.reference)
    const id = reference?.match(/(?:^|\/)Condition\/([^/]+)$/)?.[1]
    if (!id) continue
    const uses = (Array.isArray(entry.use) ? entry.use : [entry.use]) as CodeableConcept[]
    for (const use of uses) {
      for (const coding of use?.coding ?? []) {
        const code = str(coding.code)
        if (!code) continue
        const role = /(?:^|[^a-z0-9])cl076(?:$|[^a-z0-9])/i.test(String(coding.system ?? ""))
          ? NHIS_CL076[code]
          : FHIR_DIAGNOSIS_ROLE[code.toLowerCase()]
        if (!role) continue
        roles.set(id, (roles.get(id) ?? new Set()).add(role))
      }
    }
  }
  return roles
}

/**
 * Conditions as diagnoses and comorbidities.
 *
 * A condition the stay names only as a comorbidity goes to the comorbidity
 * list. One named only for billing is left out: billing diagnoses repeat the
 * clinical ones in the form a payer wants. Any clinical role, or no role at all
 * (most servers send none), keeps it a diagnosis, as before.
 */
export function splitFhirConditions(
  resources: Record<string, unknown>[],
  roles: Map<string, Set<DiagnosisRole>>,
): { diagnoses: EhrTagValue[]; comorbidities: EhrTagValue[] } {
  const diagnoses: EhrTagValue[] = []
  const comorbidities: EhrTagValue[] = []
  for (const resource of resources) {
    if (resource.resourceType !== "Condition") continue
    if (INACTIVE_CLINICAL.has(statusCode(resource.clinicalStatus as CodeableConcept))) continue
    if (UNTRUE_VERIFICATION.has(statusCode(resource.verificationStatus as CodeableConcept))) continue
    const mapped = tag(readConcept(resource.code as CodeableConcept))
    if (!mapped) continue
    const role = roles.get(String(resource.id ?? ""))
    if (role && !role.has("clinical") && role.has("comorbidity")) comorbidities.push(mapped)
    else if (role && role.size === 1 && role.has("billing")) continue
    else diagnoses.push(mapped)
  }
  return { diagnoses, comorbidities }
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
export function mapFhirMedications(
  resources: Record<string, unknown>[],
  /**
   * Medication resources the server returned alongside the matches, from
   * `_include`. A `medicationReference` points at one of these.
   */
  included: Record<string, unknown>[] = [],
): EhrTagValue[] {
  const byKey = new Map<string, EhrTagValue>()
  const byReference = medicationsById(included)

  for (const resource of resources) {
    const type = resource.resourceType
    if (type !== "MedicationStatement" && type !== "MedicationRequest") continue

    const status = String(resource.status ?? "").toLowerCase()
    // "intended" and "draft" are not being taken; stopped and cancelled are no
    // longer being taken. Anything else, including a server that omits status,
    // is offered and the clinician decides.
    if (["stopped", "cancelled", "entered-in-error", "draft", "intended", "not-taken"].includes(status)) continue

    const concept = readMedicationConcept(resource, byReference)
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
 * Index the Medication resources a bundle carried, by the id a reference uses.
 *
 * Both spellings, because a reference is written either way: `Medication/123`
 * when the resource stands on its own, and the bare id after the resource is
 * fetched. Matching only one form would resolve half of them.
 */
function medicationsById(included: Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>()
  for (const resource of included) {
    if (resource.resourceType !== "Medication") continue
    const id = str(resource.id)
    if (!id) continue
    byId.set(id, resource)
    byId.set(`Medication/${id}`, resource)
  }
  return byId
}

/**
 * What drug this is, however the server chose to say it.
 *
 * FHIR offers two spellings and servers genuinely differ -- several of the
 * largest emit a reference by default. Reading only the inline code meant a
 * referenced medication produced no label, and a tag with no label is dropped:
 * a patient on eight drugs arrived at the review screen on none, with nothing
 * to say anything was missing. An empty medication list reads as a fact.
 *
 * Three ways to resolve a reference, cheapest first, because each covers
 * servers the others do not:
 *
 *   1. the reference's own `display`, which many servers fill in and which
 *      needs nothing fetched;
 *   2. a `#`-prefixed pointer into this resource's own `contained` list;
 *   3. a Medication returned beside the matches by `_include`.
 *
 * The inline code still wins when present: it is the server's most direct
 * statement, and a reference is a pointer to somewhere it may also be.
 */
function readMedicationConcept(
  resource: Record<string, unknown>,
  byReference: Map<string, Record<string, unknown>>,
): { label?: string; code?: string; system?: string } {
  const inline = readConcept(resource.medicationCodeableConcept as CodeableConcept)
  if (inline.label) return inline

  const reference = resource.medicationReference as
    { reference?: unknown; display?: unknown } | undefined
  if (!reference) return inline

  const pointer = str(reference.reference)
  if (pointer) {
    const target = pointer.startsWith("#")
      ? containedById(resource, pointer.slice(1))
      : byReference.get(pointer) ?? byReference.get(pointer.split("/").slice(-2).join("/"))
    if (target) {
      const resolved = readConcept(target.code as CodeableConcept)
      if (resolved.label) return resolved
    }
  }

  // Last, and still worth having. A display is a name a person wrote, so it
  // carries no code -- but a clinician reading "Ramipril 5 mg" can act on it,
  // and the alternative here is silence.
  const display = str(reference.display)
  return display ? { label: display } : inline
}

/** A `#`-prefixed reference points inside the resource that carries it. */
function containedById(
  resource: Record<string, unknown>,
  id: string,
): Record<string, unknown> | undefined {
  const contained = Array.isArray(resource.contained) ? resource.contained : []
  return contained.find(entry =>
    !!entry && typeof entry === "object"
    && (entry as Record<string, unknown>).resourceType === "Medication"
    && str((entry as Record<string, unknown>).id) === id) as Record<string, unknown> | undefined
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
