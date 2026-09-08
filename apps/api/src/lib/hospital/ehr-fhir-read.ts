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
  return splitBundleEntries(body).matches
}

/**
 * A searchset separated into what matched and what came along with it.
 *
 * `_include` asks the server to return referenced resources beside the
 * matches, and the bundle marks which is which. The distinction matters twice:
 * an included Medication is not a medication the patient is on -- it is the
 * drug definition a MedicationRequest points at -- and it carries no date, so
 * counting it toward the newest-300 cut would let a drug definition displace a
 * real result and then be sliced off itself, leaving a pointer to nothing.
 *
 * A server that omits `search.mode` on a plain search has no includes to
 * separate, so an unmarked entry is a match. Only an entry that says
 * `include` (or `outcome`, which is a diagnostic and not data) is held back.
 */
export function splitBundleEntries(body: unknown): {
  matches: Record<string, unknown>[]
  included: Record<string, unknown>[]
} {
  const bundle = body as { entry?: { resource?: unknown; search?: { mode?: unknown } }[] }
  const matches: Record<string, unknown>[] = []
  const included: Record<string, unknown>[] = []
  if (!Array.isArray(bundle?.entry)) return { matches, included }

  for (const entry of bundle.entry) {
    const resource = entry?.resource
    if (!resource || typeof resource !== "object") continue
    const mode = String(entry?.search?.mode ?? "").toLowerCase()
    if (mode === "outcome") continue
    if (mode === "include") included.push(resource as Record<string, unknown>)
    else matches.push(resource as Record<string, unknown>)
  }
  return { matches, included }
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
 * The admission this ИЗ № names, when the server models one.
 *
 * ИЗ № is an admission number, so the encounter carrying it is this stay --
 * which is what makes "the labs for this admission" answerable rather than
 * "the labs for this person, ever". Scoped to the patient we already matched,
 * so a number reused by another patient in a different year cannot answer.
 *
 * Not found is an ordinary outcome, not a failure. Plenty of servers do not
 * expose Encounter, or do not put the record number on it, and an integration
 * that only works at sites which do is an integration that mostly does not
 * work. The caller falls back to a date window.
 *
 * Several matches are ignored rather than guessed between: the ИЗ № restarts
 * each year, so two encounters carrying it are two admissions, and picking one
 * would silently attach the wrong stay's results to this case.
 */
export async function findFhirEncounter(input: {
  endpoint: string
  credential: string
  patientId: string
  identifier: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): Promise<string | null> {
  const base = input.endpoint.replace(/\/$/, "")
  const query = new URLSearchParams({
    patient: input.patientId,
    identifier: input.identifier,
    _count: "2",
  })
  const result = await fhirGetJson(
    `${base}/Encounter?${query.toString()}`,
    input.credential,
    input.fetchImpl ?? fetch,
    input.timeoutMs,
  )
  if (!result.ok) return null

  const entries = bundleEntries(result.body)
  if (entries.length !== 1) return null
  const id = typeof entries[0].id === "string" ? entries[0].id : ""
  return id || null
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
 * The server's own "there is more" pointer.
 *
 * A searchset says how to get the next page rather than expecting the caller
 * to construct it -- offsets and continuation tokens differ per server, so the
 * link is the only portable way to page.
 */
function nextPageUrl(body: unknown): string | null {
  const links = (body as { link?: unknown }).link
  if (!Array.isArray(links)) return null
  for (const entry of links) {
    if (!entry || typeof entry !== "object") continue
    const link = entry as { relation?: unknown; url?: unknown }
    if (String(link.relation ?? "") !== "next") continue
    const url = String(link.url ?? "").trim()
    if (url) return url
  }
  return null
}

/**
 * Whether a next link may be followed.
 *
 * The link is content from the response, and following it is a server-side
 * request carrying the bearer token. A server that has been tampered with, or
 * simply misconfigured behind a proxy, can point it anywhere -- so it is
 * checked against the endpoint the operator configured rather than trusted
 * because it arrived in a bundle we asked for.
 */
/**
 * The next page's absolute URL, when it is one this endpoint may serve.
 *
 * A searchset may state its next link relative to the base -- `?page=2`, or
 * `/fhir/Observation?_getpages=...`. Parsing it without a base threw, which
 * `sameOrigin` reported as a foreign origin, so paging silently stopped at
 * the first page for every server that writes them that way. The result was a
 * truncated list presented as a complete one.
 *
 * Resolved against the endpoint and then checked: the link is content from a
 * response, and following it is a server-side request carrying the bearer
 * token, so a link that resolves somewhere else is refused rather than
 * dialled.
 */
function nextPageWithin(candidate: string, endpoint: string): string | null {
  try {
    const base = new URL(endpoint)
    const resolved = new URL(candidate, base)
    return resolved.origin === base.origin ? resolved.toString() : null
  } catch {
    return null
  }
}

/**
 * When a result was taken, as a sortable number.
 *
 * Servers vary in which element they populate, and a resource with none is
 * treated as oldest: an undated result must never displace a dated one out of
 * the newest 300, because "we do not know when this was taken" is the weakest
 * claim in the set, not the strongest.
 */
function resourceInstant(resource: Record<string, unknown>): number {
  for (const key of ["effectiveDateTime", "issued", "recordedDate", "authoredOn", "date"]) {
    const value = resource[key]
    if (typeof value !== "string") continue
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  const period = resource.effectivePeriod as { start?: unknown } | undefined
  if (period && typeof period.start === "string") {
    const parsed = Date.parse(period.start)
    if (!Number.isNaN(parsed)) return parsed
  }
  return 0
}

/**
 * Fetch one resource type, newest first, up to a cap.
 *
 * A failure returns an empty list and its reason rather than aborting the whole
 * pull. A server that serves Observations but refuses Conditions should still
 * yield the labs — offering a clinician the half that arrived is better than
 * offering nothing because one endpoint was misconfigured, and the review
 * screen names what did not arrive.
 *
 * **`_count` is a hint, not an instruction.** Servers cap a page where they
 * like, commonly at 50, so asking for 300 and reading one bundle can quietly
 * take 50 of 400. The pointer to the rest is in the bundle, so the pages are
 * followed until the cap is reached or the server runs out.
 *
 * **Newest first, twice over.** `_sort=-date` asks the server to order them,
 * and the collected resources are sorted again here. The second pass is not
 * redundant: a server that ignores or refuses `_sort` would otherwise hand back
 * its oldest results, and Core would present a three-year-old haemoglobin as
 * this patient's current one. A cap that keeps the wrong 300 is worse than no
 * cap at all.
 */
/** How many results are kept, newest first. */
export const FHIR_RESULT_LIMIT = 300

/**
 * A bound on paging, so an unusual server cannot hold a clinician's screen
 * open indefinitely. Reaching it is not an error: the cap already says only
 * the newest results are kept.
 */
const MAX_PAGES = 12

export async function fetchPatientResources(input: {
  endpoint: string
  credential: string
  resourceType: string
  patientId: string
  /**
   * Scope to one admission, when the encounter behind this ИЗ № was found.
   *
   * Only for what belongs to an admission. An allergy does not, and scoping
   * one to this stay would hide a penicillin reaction recorded three years ago.
   */
  encounterId?: string | null
  /** Ignore anything taken before this, as an ISO date. */
  since?: string | null
  /**
   * A reference to follow server-side, e.g. `MedicationRequest:medication`.
   *
   * A medication is as often a pointer to a Medication resource as a code
   * inline. Without asking for the target the pointer resolves to nothing and
   * the drug is dropped -- silently, and on some of the largest EHR vendors.
   */
  include?: string
  /** Extra search parameters, e.g. a status filter or a category. */
  params?: Record<string, string>
  count?: number
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): Promise<{
  resources: Record<string, unknown>[]
  /** Resources returned because they were referenced, not because they matched. */
  included?: Record<string, unknown>[]
  errorCode?: string
  truncated?: true
}> {
  const base = input.endpoint.replace(/\/$/, "")
  const limit = input.count ?? FHIR_RESULT_LIMIT
  const query = new URLSearchParams({
    patient: input.patientId,
    _count: String(limit),
    // Asked for, then verified below. A server free to choose the order is a
    // server free to hand back the oldest results first.
    _sort: "-date",
    ...(input.encounterId ? { encounter: input.encounterId } : {}),
    ...(input.since ? { date: `ge${input.since}` } : {}),
    ...(input.include ? { _include: input.include } : {}),
    ...(input.params ?? {}),
  })

  const collected: Record<string, unknown>[] = []
  // Kept apart from the matches so the cut below cannot discard a referenced
  // resource and leave the pointer to it dangling.
  const carried: Record<string, unknown>[] = []
  let url: string | null = `${base}/${input.resourceType}?${query.toString()}`
  let pages = 0
  let truncated = false
  // Whether the server was observed to honour `-date`. Undefined until a page
  // arrives with enough entries to tell.
  let serverSorted: boolean | undefined

  while (url && pages < MAX_PAGES) {
    const result = await fhirGetJson(
      url, input.credential, input.fetchImpl ?? fetch, input.timeoutMs,
    )
    // A failure on the first page is a failure. A failure while paging keeps
    // what already arrived rather than throwing it away for being incomplete.
    if (!result.ok) {
      if (pages === 0) return { resources: [], errorCode: result.errorCode }
      truncated = true
      break
    }

    const { matches: page, included: alongside } = splitBundleEntries(result.body)
    if (serverSorted === undefined && page.length > 1) {
      serverSorted = resourceInstant(page[0]) >= resourceInstant(page[page.length - 1])
    }
    collected.push(...page)
    carried.push(...alongside)
    pages += 1

    const next = nextPageUrl(result.body)
    if (!next) { url = null; break }
    const following = nextPageWithin(next, input.endpoint)
    if (!following) { truncated = true; break }

    // Stopping at the cap is only safe once the server has been *seen* putting
    // the newest first. Stopping early on a server that sorts the other way
    // keeps its oldest results and discards the ones being asked for -- which
    // is the whole defect, moved rather than fixed. When the order is unknown
    // or wrong, keep paging to the page cap and let the sort below decide.
    if (serverSorted === true && collected.length >= limit) { truncated = true; break }

    url = following
  }
  if (url && pages >= MAX_PAGES) truncated = true

  // Sorted here regardless of what the server did with `_sort`, then cut. This
  // is what makes "the newest 300" a promise rather than a hope.
  collected.sort((a, b) => resourceInstant(b) - resourceInstant(a))
  const resources = collected.slice(0, limit)
  const includedPart = carried.length ? { included: carried } : {}
  return truncated || collected.length > limit
    ? { resources, ...includedPart, truncated: true }
    : { resources, ...includedPart }
}
