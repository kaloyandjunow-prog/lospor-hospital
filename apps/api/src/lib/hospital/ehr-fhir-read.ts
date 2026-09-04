import "server-only"

import { classifyFhirStatus } from "./ehr-transport-fhir"

/**
 * Reading from a FHIR server.
 *
 * The outbound half of the transport posts one resource and is done. Reading is
 * several requests that have to agree with each other — find the patient, then
 * fetch what hangs off them — so the mechanics live here once rather than being
 * rewritten per resource type.
 *
 * Everything is a GET with a bearer token and a deadline. There is no retry:
 * this runs while a clinician waits, and the honest answer to a server that is
 * not responding is to say so rather than to hold the screen open twice as
 * long. The queue retries deliveries; a lookup is not a delivery.
 */

export type FhirReadResult =
  | { ok: true; body: unknown }
  | { ok: false; errorCode: string }

/**
 * One authenticated GET.
 *
 * Shared with discovery, which had its own private copy: the two must classify
 * a 401 and a timeout identically or an operator's "test the connection" would
 * report something different from what a real lookup does, which is worse than
 * having no test button at all.
 */
export async function fhirGetJson(
  url: string,
  credential: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15_000,
): Promise<FhirReadResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/fhir+json", Authorization: `Bearer ${credential}` },
      signal: controller.signal,
    })
    if (!response.ok) {
      return { ok: false, errorCode: classifyFhirStatus(response.status).errorCode }
    }
    return { ok: true, body: await response.json() }
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError"
    return { ok: false, errorCode: aborted ? "TIMEOUT" : "UNREACHABLE" }
  } finally {
    clearTimeout(timer)
  }
}

/** Every entry resource in a searchset bundle, or nothing if it is not one. */
export function bundleEntries(body: unknown): Record<string, unknown>[] {
  const bundle = body as { entry?: { resource?: unknown }[] }
  if (!Array.isArray(bundle?.entry)) return []
  return bundle.entry
    .map(entry => entry?.resource)
    .filter((resource): resource is Record<string, unknown> =>
      !!resource && typeof resource === "object")
}

export type FhirPatientMatch =
  | { found: true; patientId: string; resource: Record<string, unknown> }
  | { found: false; errorCode?: string; ambiguous?: true }

/**
 * Find the one patient this record number names.
 *
 * Searched on value alone, without an identifier system, which is the same
 * choice `probeFhirIdentifierSystems` makes and for the same reason: asking an
 * operator to supply an OID they would have to get from their vendor is how an
 * integration stalls for a fortnight, and the server names its own systems in
 * what it returns anyway.
 *
 * More than one match is refused rather than resolved. A record number that
 * matches two patients means the search was not specific enough — a value
 * colliding across two identifier systems, most likely — and picking one of
 * them would attach a stranger's diagnoses to this case. That is the worst
 * outcome available here, so it is the one thing this will not do.
 */
export async function findFhirPatient(input: {
  endpoint: string
  credential: string
  identifier: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): Promise<FhirPatientMatch> {
  const base = input.endpoint.replace(/\/$/, "")
  const query = new URLSearchParams({ identifier: input.identifier, _count: "2" })
  const result = await fhirGetJson(
    `${base}/Patient?${query.toString()}`,
    input.credential,
    input.fetchImpl ?? fetch,
    input.timeoutMs,
  )
  if (!result.ok) return { found: false, errorCode: result.errorCode }

  const entries = bundleEntries(result.body)
  if (entries.length === 0) return { found: false }
  if (entries.length > 1) return { found: false, ambiguous: true }

  const patientId = typeof entries[0].id === "string" ? entries[0].id : ""
  if (!patientId) return { found: false, errorCode: "PATIENT_WITHOUT_ID" }
  return { found: true, patientId, resource: entries[0] }
}

/**
 * Fetch one resource type for a patient.
 *
 * A failure returns an empty list and its reason rather than aborting the whole
 * pull. A server that serves Observations but refuses Conditions should still
 * yield the labs — offering a clinician the half that arrived is better than
 * offering nothing because one endpoint was misconfigured, and the review
 * screen shows only what actually came.
 */
export async function fetchPatientResources(input: {
  endpoint: string
  credential: string
  resourceType: string
  patientId: string
  /** Extra search parameters, e.g. a status filter or a category. */
  params?: Record<string, string>
  count?: number
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): Promise<{ resources: Record<string, unknown>[]; errorCode?: string }> {
  const base = input.endpoint.replace(/\/$/, "")
  const query = new URLSearchParams({
    patient: input.patientId,
    _count: String(input.count ?? 200),
    ...(input.params ?? {}),
  })
  const result = await fhirGetJson(
    `${base}/${input.resourceType}?${query.toString()}`,
    input.credential,
    input.fetchImpl ?? fetch,
    input.timeoutMs,
  )
  if (!result.ok) return { resources: [], errorCode: result.errorCode }
  return { resources: bundleEntries(result.body) }
}
