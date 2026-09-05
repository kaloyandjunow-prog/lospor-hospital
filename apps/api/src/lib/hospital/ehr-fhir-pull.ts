import "server-only"

import { ehrAgeProposal } from "@lospor/core/ehr-age"
import { normalizeEhrImport } from "@lospor/core/ehr-import"

import { splitBodyObservations } from "./ehr-fhir-body"
import {
  mapFhirAllergies,
  mapFhirBirthDate,
  mapFhirConditions,
  mapFhirMedications,
  mapFhirPlannedProcedures,
  mapFhirSex,
} from "./ehr-fhir-clinical"
import { mapFhirObservations } from "./ehr-fhir-observations"
import { fetchPatientResources, findFhirPatient } from "./ehr-fhir-read"
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

/** What we ask the server for, and which field each answer becomes. */
const RESOURCES = [
  { type: "Observation", params: { category: "laboratory,vital-signs" } },
  { type: "Condition" },
  { type: "AllergyIntolerance" },
  { type: "MedicationStatement" },
  { type: "MedicationRequest" },
  { type: "ServiceRequest" },
] as const

export type FhirPullResult =
  | { ok: true; importId: string; created: boolean; fieldCount: number }
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
    /** Which numbering the record number lives in, when the site has said. */
    recordNumberSystem?: string | null
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

  const patient = await findFhirPatient({
    ...common,
    identifier: input.identifier,
    recordNumberSystem: input.recordNumberSystem,
  })
  if (!patient.found) {
    if (patient.ambiguous) return { ok: false, reason: "ambiguous" }
    if (patient.wrongIdentifierSystem) return { ok: false, reason: "wrong-identifier-system" }
    if (patient.errorCode) return { ok: false, reason: "unreachable", errorCode: patient.errorCode }
    return { ok: false, reason: "not-found" }
  }

  const fetched = await Promise.all(RESOURCES.map(async entry => ({
    type: entry.type,
    result: await fetchPatientResources({
      ...common,
      resourceType: entry.type,
      patientId: patient.patientId,
      params: "params" in entry ? entry.params : undefined,
    }),
  })))
  const of = (type: string) =>
    fetched.find(entry => entry.type === type)?.result.resources ?? []

  // Height, weight and blood group arrive as Observations but are fields, not
  // laboratory results. They come out first so the rest can go to the lab
  // reader unchanged — sending them through it would have every one refused as
  // a test the catalogue has no entry for.
  const { body, rest } = splitBodyObservations(of("Observation"))

  const [siteMap, units] = await Promise.all([siteLabCodeMap(), assumedUnits()])
  const labs = mapFhirObservations(
    { resourceType: "Bundle", entry: rest.map(resource => ({ resource })) },
    { siteMap, assumedUnits: units },
  )
  // Codes nothing could place become the "waiting for an answer" list on the
  // Status mapping screen, ranked by how often they have arrived.
  if (labs.unmapped.length > 0) {
    await recordUnmappedCodes(labs.unmapped, now).catch(() => undefined)
  }

  const allergies = mapFhirAllergies(of("AllergyIntolerance"))
  const conditions = mapFhirConditions(of("Condition"))
  const medications = mapFhirMedications([
    ...of("MedicationStatement"),
    ...of("MedicationRequest"),
  ])
  const procedures = mapFhirPlannedProcedures(of("ServiceRequest"))

  // Age is computed from the date of birth rather than believed from a
  // transmitted number: a worklist entry written three weeks ago saying "5 days
  // old" describes a neonate who is now approaching a month, and the
  // neonate/infant boundary moves underneath it. The date of birth itself is
  // never stored — see ehr-age in core.
  const age = ehrAgeProposal({
    egn: input.identifierType === "EGN" ? input.identifier : null,
    ...(mapFhirBirthDate(patient.resource)
      ? ageYearsFromBirthDate(mapFhirBirthDate(patient.resource)!, now)
      : {}),
    asOf: now,
  })

  const fields: Record<string, unknown> = {
    ...(age ? { ageValue: age.ageValue, ageUnit: age.ageUnit } : {}),
    ...(mapFhirSex(patient.resource) ? { sex: mapFhirSex(patient.resource) } : {}),
    ...body,
    ...(conditions.length ? { diagnoses: conditions } : {}),
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

  if (canonical.fields.length === 0) return { ok: false, reason: "nothing-importable" }

  const recorded = await recordEhrImport(client, {
    institutionId: input.institutionId,
    identifier: input.identifier,
    identifierType: input.identifierType,
    transport: "FHIR",
    canonical,
    now,
  })

  return {
    ok: true,
    importId: recorded.id,
    created: recorded.created,
    fieldCount: canonical.fields.length,
  }
}

/**
 * A date of birth expressed as the years/months/days `ehrAgeProposal` collapses.
 *
 * It resolves an ЕГН itself, but a FHIR `birthDate` is the other exact source
 * and the one an ИЗ №-only site will have. Passed as reported parts rather than
 * as a second date argument so the unit banding stays in core, where the
 * neonate and infant boundaries are already defined.
 */
function ageYearsFromBirthDate(birthDate: string, asOf: Date): { years?: number; months?: number; days?: number } {
  const born = new Date(birthDate)
  if (Number.isNaN(born.getTime())) return {}
  const days = Math.floor((asOf.getTime() - born.getTime()) / 86_400_000)
  if (days < 0) return {}
  if (days < 28) return { days }
  const months = Math.floor(days / 30.4375)
  if (months < 24) return { months }
  return { years: Math.floor(days / 365.25) }
}
