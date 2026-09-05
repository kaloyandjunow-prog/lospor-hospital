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
  | {
      found: true
      patientId: string
      resource: Record<string, unknown>
      /**
       * True when nobody has said which numbering the record number lives in,
       * so the match could not be checked against one.
       *
       * The import proceeds -- a site has to be able to work before it has
       * configured this -- and the review screen says the identity is
       * unverified, which is a different statement from silence.
       */
      identitySystemUnverified?: true
    }
  | {
      found: false
      errorCode?: string
      ambiguous?: true
      /**
       * One patient carried this value, in a different numbering from the
       * one configured. Refused rather than returned: this is the shape a
       * wrong-patient import takes, and it looks exactly like a clean hit.
       */
      wrongIdentifierSystem?: true
    }

/**
 * Find the one patient this record number names.
 *
 * Searched on value alone, then verified against what came back.
 *
 * Searching without a system is deliberate and stays: asking an operator for
 * an OID they would have to get from their vendor is how an integration stalls
 * for a fortnight, and the server names its own systems in the resource it
 * returns anyway. So the answer to "is this the right kind of number?" is in
 * the reply, and does not need to be in the question.
 *
 * What it needed was to be asked. A hospital numbers the same person several
 * ways -- admission number, permanent record number, ward number, visit
 * number -- and those are separate namespaces holding numbers of the same
 * shape. Two sequential counters reaching the same value is not exotic; over a
 * year of admissions it is close to certain.
 *
 * More than one match was already refused, and rightly. The gap was a single
 * match: exactly one patient carried that value, in a different numbering, and
 * it was accepted -- so a stranger's diagnoses, allergies and medications were
 * proposed onto this case, looking like a clean hit. An allergy list belonging
 * to somebody else is the worst outcome available here, so it is now refused
 * the way an ambiguous match is.
 *
 * Until a site says which system its record numbers live in, a match is
 * returned marked unverified rather than refused. Failing closed before
 * configuration would mean no site could import anything until it had answered
 * a question it cannot answer without seeing real traffic first.
 */
export async function findFhirPatient(input: {
  endpoint: string
  credential: string
  identifier: string
  /**
   * The identifier system this hospital's record number lives in, when the
   * site has said. Undefined means it has not, and the match is returned
   * unverified rather than refused.
   */
  recordNumberSystem?: string | null
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

  // The search asked which patient holds this value, not which patient holds
  // it *as a record number*. Verify against what came back, which is why the
  // systemless search is still the right search: the server names its own
  // systems in the resource, so the answer is in the reply.
  const expected = (input.recordNumberSystem ?? "").trim()
  if (!expected) return { found: true, patientId, resource: entries[0], identitySystemUnverified: true }
  if (!carriesIdentifier(entries[0], expected, input.identifier)) {
    return { found: false, wrongIdentifierSystem: true }
  }
  return { found: true, patientId, resource: entries[0] }
}

/**
 * Whether this patient really carries that value as that kind of identifier.
 *
 * Both halves matter. The system alone would accept a patient who has *an*
 * admission number, any admission number, which is every inpatient. The value
 * alone is the search we already did.
 */
function carriesIdentifier(
  resource: Record<string, unknown>,
  system: string,
  value: string,
): boolean {
  const identifiers = Array.isArray(resource.identifier) ? resource.identifier : []
  const wanted = value.trim()
  return identifiers.some(entry => {
    if (!entry || typeof entry !== "object") return false
    const candidate = entry as { system?: unknown; value?: unknown }
    return String(candidate.system ?? "").trim() === system
      && String(candidate.value ?? "").trim() === wanted
  })
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
    // 300, not a date window. The request is scoped to one ИЗ №, which is one
    // admission, so the volume is already bounded by the thing that matters
    // clinically -- and Core discards the excess per test, reporting the count
    // rather than dropping it silently.
    _count: String(input.count ?? 300),
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
