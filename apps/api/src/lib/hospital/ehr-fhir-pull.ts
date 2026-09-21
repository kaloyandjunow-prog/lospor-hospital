import "server-only"

import { ehrAgeProposal } from "@lospor/core/ehr-age"
import { normalizeEhrImport } from "@lospor/core/ehr-import"

import { splitBodyObservations } from "./ehr-fhir-body"
import {
  mapFhirAllergies,
  mapFhirBirthDate,
  encounterDiagnosisRoles,
  fhirCodeSystemsSeen,
  splitFhirConditions,
  mapFhirMedications,
  mapFhirPlannedProcedures,
  mapFhirSex,
} from "./ehr-fhir-clinical"
import { mapFhirObservations } from "./ehr-fhir-observations"
import { fetchPatientResources, findFhirEncounterResource, findFhirPatient } from "./ehr-fhir-read"
import {
  NO_CODE_SYSTEM_ANSWERS,
  recordUnrecognisedCodeSystems,
  siteCodeSystemAnswers,
  unrecognisedCodeSystems,
} from "./ehr-code-systems"
import { diagnosisCodeSystemsSeen, resolveImportedDiagnoses, siteLocale } from "./ehr-icd10"
import { recordEhrImport, type EhrImportClient } from "./ehr-import"
import { assumedUnits, recordUnmappedCodes, siteLabCodeMap } from "./ehr-lab-code-map"
import type { PatientIdentifierType } from "@/generated/prisma/enums"

/**
 * Ask a FHIR server for everything it holds on one patient.
 *
 * Folder drop is a hospital pushing a document we read on a schedule. FHIR is
 * the opposite: nothing arrives unrequested, so this runs while a clinician
 * waits, having typed a record number. That is the shape the design settled on
 * — better minimisation, and it is why unclaimed imports largely stop existing.
 *
 * Everything it produces goes through the same `normalizeEhrImport` the folder
 * transport uses and lands as the same staged `EhrImport`. Nothing here writes
 * a clinical value; the review screen is still the only thing that can.
 *
 * The resource fetches are independent and none of them can fail the pull. A
 * server that serves Observations but refuses Conditions yields the labs, and
 * the clinician is offered what actually arrived rather than nothing.
 */

/**
 * Whether a group belongs to this admission or to the patient.
 *
 * **This is a clinical distinction, not a technical one, and getting it wrong
 * is dangerous in one direction only.**
 *
 * Results and the planned operation belong to the stay. Asking for a lifetime
 * of laboratory results to document one anaesthetic is how a screen fills with
 * a decade of blood counts, and it is what made the old 300-row cut land
 * arbitrarily.
 *
 * Allergies, diagnoses and current medications do not belong to the stay. An
 * allergy is a standing contraindication whenever it was learned -- scoping it
 * to this admission would hide a penicillin reaction recorded three years ago,
 * and an allergy omitted can kill where one repeated costs a drug choice.
 * Comorbidities and regular medications are past history by definition: they
 * are the reason to import them at all.
 */
type ResourceScope = "admission" | "patient"

/**
 * What we ask the server for, and which field each answer becomes.
 *
 * Each carries the clinical group it feeds. When a fetch fails, that group is
 * what the clinician is told about -- "allergies could not be read", not
 * "AllergyIntolerance returned 503". Two resources feed medications, and either
 * failing makes the medication list incomplete, which is the honest thing to
 * say about it.
 *
 * **Appointment and ServiceRequest are both asked for, because hospitals record
 * the planned operation in whichever one their theatre list uses.** One is the
 * surgeon's order -- "this patient needs a cholecystectomy" -- and the other is
 * the booked slot. `mapFhirPlannedProcedures` has read both since it was
 * written; only ServiceRequest was ever requested, so the Appointment half was
 * unreachable and a booking-based site imported no procedure and was told
 * nothing about it.
 *
 * `include` names the referenced resources a bundle should carry with its
 * matches. A medication is frequently a pointer to a Medication resource rather
 * than a code inline, and without asking for the target the pointer resolves to
 * nothing -- which reaches the review screen as a patient on no medication.
 */
const RESOURCES = [
  { type: "Observation", group: "labs", scope: "admission", params: { category: "laboratory,vital-signs" } },
  { type: "ServiceRequest", group: "procedures", scope: "admission" },
  // No `encounter` search parameter exists for Appointment in R4, so this is
  // scoped by date rather than to the stay. `fetchPatientResources` drops the
  // parameter for it rather than sending one the server would reject.
  { type: "Appointment", group: "procedures", scope: "admission" },
  { type: "Condition", group: "diagnoses", scope: "patient" },
  { type: "AllergyIntolerance", group: "allergies", scope: "patient" },
  { type: "MedicationStatement", group: "medications", scope: "patient", include: "MedicationStatement:medication" },
  { type: "MedicationRequest", group: "medications", scope: "patient", include: "MedicationRequest:medication" },
] as const

/** Resource types with no `encounter` search parameter in FHIR R4. */
const NO_ENCOUNTER_SCOPE = new Set(["Appointment"])

/** A group the hospital system holds, as a clinician would name it. */
export type EhrSourceGroup = "labs" | "diagnoses" | "allergies" | "medications" | "procedures"

/**
 * A group the clinician cannot take as complete, and why.
 *
 * `errorCode` names a transport failure; `"TRUNCATED"` says the server had
 * more than we were willing to read. Both mean the same thing to somebody
 * looking at the list -- what is on the screen is not all of it -- which is
 * why they travel as one signal rather than two.
 */
export type EhrUnreadSource = { group: EhrSourceGroup; errorCode: string }

export type FhirPullResult =
  | {
      ok: true
      importId: string
      created: boolean
      fieldCount: number
      /**
       * Groups the server refused or failed to answer for.
       *
       * The pull still succeeds -- that is the design, and it is the right
       * one -- but succeeding quietly is what turns a failed allergy fetch
       * into a patient who appears to have no allergies.
       */
      unread: EhrUnreadSource[]
    }
  | {
      ok: false
      // "wrong-identifier-system": one patient carried this number, in a
      // different numbering from the one this site configured. Reported
      // separately from "not-found" because it means something an operator can
      // act on -- either the record number was mistyped, or the configured
      // system is wrong -- and both are worth saying out loud.
      reason: "not-found" | "ambiguous" | "wrong-identifier-system" | "nothing-importable" | "unreachable"
      errorCode?: string
    }

export async function pullFhirImport(
  client: EhrImportClient,
  input: {
    institutionId: string
    endpoint: string
    credential: string
    identifier: string
    /**
     * Stage for this case rather than deduplicating against other cases.
     * A clinician asking about a patient for a second case is a second
     * question, and must not be answered with "the hospital holds nothing"
     * because the first case already took the answer.
     */
    restageFor?: string
    /**
     * Which numbering the record number lives in, when the site has said.
     */
    recordNumberSystem?: string | null
    /**
     * Which numbering the hospital's ЕГН values live in.
     *
     * A separate namespace from the record number, and the one a search by
     * ЕГН has to be verified against. Checking an ЕГН against the record
     * number's namespace refuses every correct match, because the patient
     * carries that value as a national identifier and not as an admission
     * number.
     */
    nationalIdentifierSystem?: string | null
    identifierType: PatientIdentifierType
    now?: Date
    timeoutMs?: number
    fetchImpl?: typeof fetch
  },
): Promise<FhirPullResult> {
  const now = input.now ?? new Date()
  const common = {
    endpoint: input.endpoint,
    credential: input.credential,
    timeoutMs: input.timeoutMs,
    fetchImpl: input.fetchImpl,
  }

  // The namespace to verify against depends on which number was typed. The
  // patient carries an ЕГН as a national identifier and an ИЗ № as an
  // admission number; checking one against the other's namespace refuses
  // every correct match, and does it in the shape of a wrong-patient
  // warning.
  const expectedSystem = input.identifierType === "EGN"
    ? input.nationalIdentifierSystem
    : input.recordNumberSystem

  const patient = await findFhirPatient({
    ...common,
    identifier: input.identifier,
    recordNumberSystem: expectedSystem,
  })
  if (!patient.found) {
    if (patient.ambiguous) return { ok: false, reason: "ambiguous" }
    if (patient.wrongIdentifierSystem) return { ok: false, reason: "wrong-identifier-system" }
    if (patient.errorCode) return { ok: false, reason: "unreachable", errorCode: patient.errorCode }
    return { ok: false, reason: "not-found" }
  }

  // The stay this ИЗ № names. Null at a server that does not model encounters
  // or does not put the record number on them, which is common enough that it
  // must not be a failure -- the date window below covers it.
  const encounter = input.identifierType === "IZ"
    ? await findFhirEncounterResource({
        ...common, patientId: patient.patientId, identifier: input.identifier,
      }).catch(() => null)
    : null
  const encounterId = typeof encounter?.id === "string" ? encounter.id : null

  // The fallback when there is no encounter to scope to. ИЗ № restarts every
  // January, so the year the number belongs to is the year it is being used in,
  // and results older than that belong to a different admission number anyway.
  const yearStart = `${now.getFullYear()}-01-01`

  const fetched = await Promise.all(RESOURCES.map(async entry => {
    const admissionScoped = (entry.scope as ResourceScope) === "admission"
    const scopeToEncounter = admissionScoped && !NO_ENCOUNTER_SCOPE.has(entry.type)
    return {
      type: entry.type,
      group: entry.group as EhrSourceGroup,
      result: await fetchPatientResources({
        ...common,
        resourceType: entry.type,
        patientId: patient.patientId,
        encounterId: scopeToEncounter ? encounterId : null,
        // Belt and braces, and deliberately not exclusive: an encounter scope
        // is the precise answer, the year is the safe one, and a server that
        // accepts both simply returns the same rows. A type that cannot be
        // scoped to an encounter at all always takes the year.
        since: admissionScoped && !(scopeToEncounter && encounterId) ? yearStart : null,
        include: "include" in entry ? entry.include : undefined,
        params: "params" in entry ? entry.params : undefined,
      }),
    }
  }))
  const of = (type: string) =>
    fetched.find(entry => entry.type === type)?.result.resources ?? []

  // Resources the server returned because we referenced them, not because they
  // matched. A Medication carrying the drug's code is one of these, and it is
  // the thing a `medicationReference` points at.
  const included = fetched.flatMap(entry => entry.result.included ?? [])

  // One entry per group, not per resource: a clinician reads "medications",
  // and saying it twice because two endpoints back it would be noise. The
  // first error code stands for the group -- it is a diagnostic detail for an
  // operator, and the group is what changes what the clinician does.
  const unread: EhrUnreadSource[] = []
  for (const entry of fetched) {
    // A refusal and a truncation are different failures with the same
    // consequence: the list on the screen is not the whole list. Reading only
    // errorCode meant a capped or part-paged result was reported as complete,
    // which is the quieter half of the same defect the unread warning exists
    // for.
    const reason = entry.result.errorCode ?? (entry.result.truncated ? "TRUNCATED" : null)
    if (!reason) continue
    if (unread.some(seen => seen.group === entry.group)) continue
    unread.push({ group: entry.group, errorCode: reason })
  }

  // Height, weight and blood group arrive as Observations but are fields, not
  // laboratory results. They come out first so the rest can go to the lab
  // reader unchanged — sending them through it would have every one refused as
  // a test the catalogue has no entry for.
  const { body, rest } = splitBodyObservations(of("Observation"))

  // What this hospital said its code-list addresses mean. A failure to read
  // it loses only the recognition it adds, never the import.
  const [siteMap, units, codeSystems] = await Promise.all([
    siteLabCodeMap(),
    assumedUnits(),
    siteCodeSystemAnswers().catch(() => ({ answers: NO_CODE_SYSTEM_ANSWERS, answered: new Set<string>() })),
  ])
  const answers = codeSystems.answers
  const labs = mapFhirObservations(
    { resourceType: "Bundle", entry: rest.map(resource => ({ resource })) },
    { siteMap, assumedUnits: units, codeSystems: answers },
  )
  // Codes nothing could place become the "waiting for an answer" list on the
  // Status mapping screen, ranked by how often they have arrived.
  if (labs.unmapped.length > 0) {
    await recordUnmappedCodes(labs.unmapped, now).catch(() => undefined)
  }

  const allergies = mapFhirAllergies(of("AllergyIntolerance"))
  const split = splitFhirConditions(of("Condition"), encounterDiagnosisRoles(encounter))
  const locale = siteLocale()
  const conditions = {
    diagnoses: resolveImportedDiagnoses(split.diagnoses, locale, answers),
    comorbidities: resolveImportedDiagnoses(split.comorbidities, locale, answers),
  }
  const medications = mapFhirMedications(
    [...of("MedicationStatement"), ...of("MedicationRequest")],
    included,
    answers,
  )
  // Both, deduplicated by the mapper: a site exposing its theatre list as
  // bookings *and* orders would otherwise offer the same operation twice.
  const procedures = mapFhirPlannedProcedures([
    ...of("ServiceRequest"),
    ...of("Appointment"),
  ], answers)

  // Addresses nothing recognised become questions on the Status code-list
  // screen. Diagnoses are read before resolution, which rewrites a resolved
  // one to LOSPOR's own ICD-10.
  const unrecognised = unrecognisedCodeSystems([
    ...diagnosisCodeSystemsSeen([...split.diagnoses, ...split.comorbidities]),
    ...fhirCodeSystemsSeen([...of("ServiceRequest"), ...of("Appointment"), ...of("MedicationStatement"), ...of("MedicationRequest")]),
    ...labs.unmapped.map(item => ({ system: item.system, field: "labs" as const, code: item.code, label: item.display })),
  ], codeSystems.answered)
  if (unrecognised.length > 0) {
    await recordUnrecognisedCodeSystems(unrecognised, now).catch(() => undefined)
  }

  // Age is resolved from the date of birth rather than believed from a
  // transmitted number: a worklist entry written three weeks ago saying "5 days
  // old" describes a neonate who is now approaching a month, and the
  // neonate/infant boundary moves underneath it. The date of birth itself is
  // never stored — see ehr-age in core.
  //
  // The date goes to Core whole. This used to convert it here first, dividing
  // days by 30.4375 and 365.25 and passing the result in as a *reported* age --
  // which put a two-month-old at one month and a patient on their eighteenth
  // birthday at seventeen, on the exact boundary the paediatric mode check sits
  // on. Core has done calendar arithmetic for the ЕГН case all along, so the
  // same patient got two different ages depending on which number a site typed.
  const age = ehrAgeProposal({
    egn: input.identifierType === "EGN" ? input.identifier : null,
    birthDate: mapFhirBirthDate(patient.resource) ?? null,
    asOf: now,
  })

  const fields: Record<string, unknown> = {
    ...(age ? { ageValue: age.ageValue, ageUnit: age.ageUnit } : {}),
    ...(mapFhirSex(patient.resource) ? { sex: mapFhirSex(patient.resource) } : {}),
    ...body,
    ...(conditions.diagnoses.length ? { diagnoses: conditions.diagnoses } : {}),
    ...(conditions.comorbidities.length ? { comorbidities: conditions.comorbidities } : {}),
    ...(medications.length ? { currentMedications: medications } : {}),
    ...(allergies.tags.length ? { allergyDetails: allergies.tags } : {}),
    ...(allergies.allergies !== undefined ? { allergies: allergies.allergies } : {}),
    ...(allergies.latexAllergy !== undefined ? { latexAllergy: allergies.latexAllergy } : {}),
    ...(procedures.length ? { procedures } : {}),
    ...(labs.values.length ? { labResults: labs.values } : {}),
  }

  const { canonical } = normalizeEhrImport({
    identifierType: input.identifierType === "EGN" ? "EGN" : "IZ",
    identifier: input.identifier,
    // Stable for this patient and server, so a second lookup while the first is
    // still on screen does not stage a duplicate: recordEhrImport dedupes on
    // the payload hash, and an unstable id would defeat it.
    sourceMessageId: `fhir:${patient.patientId}`,
    fields,
  })

  // Nothing arrived. If every group also failed, the honest answer is that we
  // could not read this patient's record -- not that it is empty.
  if (canonical.fields.length === 0) {
    if (unread.length > 0) {
      return { ok: false, reason: "unreachable", errorCode: unread[0].errorCode }
    }
    return { ok: false, reason: "nothing-importable" }
  }

  const recorded = await recordEhrImport(client, {
    institutionId: input.institutionId,
    ...(input.restageFor ? { restageFor: input.restageFor } : {}),
    identifier: input.identifier,
    identifierType: input.identifierType,
    transport: "FHIR",
    canonical,
    // Carried onto the staged row rather than reported only here: the
    // clinician reviews this minutes or hours later, and by then the search
    // that matched the patient is gone.
    identityUnverified: patient.identitySystemUnverified === true,
    // Same reasoning, same storage: the review is read long after the fetch
    // that failed, and nothing else remembers it happened.
    unread,
    now,
  })

  return {
    ok: true,
    importId: recorded.id,
    created: recorded.created,
    fieldCount: canonical.fields.length,
    unread,
  }
}

