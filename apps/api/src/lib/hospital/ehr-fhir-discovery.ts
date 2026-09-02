import "server-only"

import { classifyFhirStatus } from "./ehr-transport-fhir"

/**
 * Ask the hospital's FHIR server what it is, instead of asking their
 * integration team to describe it.
 *
 * Almost everything that varies between FHIR servers is discoverable from the
 * server itself. The resource shapes come from the spec; what a given server
 * supports comes from its CapabilityStatement at `/metadata`; and the two
 * things neither of those covers — which identifier system their record
 * numbers use, and which code systems their labs are coded in — can be read
 * off a single real Patient and its Observations.
 *
 * That matters because the alternative is a configuration screen full of free
 * text that an operator has to get exactly right, with a silent mismatch as the
 * failure: a DocumentReference whose subject identifier uses a system the
 * server does not recognise matches no patient and raises nothing.
 */

export type FhirDiscovery = {
  reachable: boolean
  /** "4.0.1", "5.0.0" — whatever the server reports. */
  fhirVersion: string | null
  software: string | null
  /** Resource types the server says it serves. */
  resources: string[]
  /** Which of the things we want are actually available here. */
  supports: {
    patient: boolean
    observation: boolean
    condition: boolean
    allergyIntolerance: boolean
    /** Some servers expose only MedicationRequest, some only MedicationStatement. */
    medicationStatement: boolean
    medicationRequest: boolean
  }
  errorCode?: string
}

const WANTED = [
  "Patient", "Observation", "Condition",
  "AllergyIntolerance", "MedicationStatement", "MedicationRequest",
] as const

async function getJson(
  url: string,
  credential: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ ok: true; body: unknown } | { ok: false; errorCode: string }> {
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

/**
 * Read the server's CapabilityStatement.
 *
 * This is the one call an operator should be able to make before anything
 * clinical happens: it answers "can this appliance reach your server, does the
 * credential work, and what does it offer" in a single click, and turns
 * configuring an integration from a fortnight of email into something testable.
 */
export async function discoverFhirCapabilities(input: {
  endpoint: string
  credential: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): Promise<FhirDiscovery> {
  const base = input.endpoint.replace(/\/$/, "")
  const result = await getJson(
    `${base}/metadata`,
    input.credential,
    input.fetchImpl ?? fetch,
    input.timeoutMs ?? 15_000,
  )

  const empty: FhirDiscovery["supports"] = {
    patient: false, observation: false, condition: false,
    allergyIntolerance: false, medicationStatement: false, medicationRequest: false,
  }

  if (!result.ok) {
    return {
      reachable: false, fhirVersion: null, software: null,
      resources: [], supports: empty, errorCode: result.errorCode,
    }
  }

  const statement = result.body as {
    fhirVersion?: unknown
    software?: { name?: unknown }
    rest?: { resource?: { type?: unknown }[] }[]
  }

  const resources = (statement.rest ?? [])
    .flatMap(rest => rest.resource ?? [])
    .map(resource => String(resource.type ?? ""))
    .filter(Boolean)

  const has = (name: string) => resources.includes(name)

  return {
    reachable: true,
    fhirVersion: typeof statement.fhirVersion === "string" ? statement.fhirVersion : null,
    software: typeof statement.software?.name === "string" ? statement.software.name : null,
    resources: WANTED.filter(has),
    supports: {
      patient: has("Patient"),
      observation: has("Observation"),
      condition: has("Condition"),
      allergyIntolerance: has("AllergyIntolerance"),
      medicationStatement: has("MedicationStatement"),
      medicationRequest: has("MedicationRequest"),
    },
  }
}

export type FhirIdentifierProbe = {
  found: boolean
  /** The identifier systems this server actually uses, read off a real Patient. */
  identifierSystems: { system: string; sampleMasked: string }[]
  errorCode?: string
}

/** Show enough of a value to recognise it, never enough to be it. */
function maskValue(value: string): string {
  if (value.length <= 2) return "*".repeat(value.length)
  return `${value.slice(0, 2)}${"*".repeat(Math.max(1, value.length - 2))}`
}

/**
 * Find out which identifier system this server uses for its record numbers.
 *
 * Searched without a system on purpose: `Patient?identifier=42` matches on
 * value alone on most servers, and the resource that comes back *names its own
 * systems*. That is the whole trick — instead of asking an operator to type an
 * OID they would have to get from their vendor, the server tells us, and the
 * operator only has to recognise which one is the record number.
 *
 * Values are masked before they leave this function. Configuring an
 * integration is not a reason to put a patient's record number on a settings
 * screen.
 */
export async function probeFhirIdentifierSystems(input: {
  endpoint: string
  credential: string
  identifier: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): Promise<FhirIdentifierProbe> {
  const base = input.endpoint.replace(/\/$/, "")
  const query = new URLSearchParams({ identifier: input.identifier, _count: "1" })
  const result = await getJson(
    `${base}/Patient?${query.toString()}`,
    input.credential,
    input.fetchImpl ?? fetch,
    input.timeoutMs ?? 15_000,
  )

  if (!result.ok) {
    return { found: false, identifierSystems: [], errorCode: result.errorCode }
  }

  const bundle = result.body as {
    entry?: { resource?: { identifier?: { system?: unknown; value?: unknown }[] } }[]
  }
  const entries = bundle.entry ?? []
  if (entries.length === 0) return { found: false, identifierSystems: [] }

  const seen = new Map<string, string>()
  for (const entry of entries) {
    for (const identifier of entry.resource?.identifier ?? []) {
      const system = typeof identifier.system === "string" ? identifier.system : ""
      const value = typeof identifier.value === "string" ? identifier.value : ""
      if (system && !seen.has(system)) seen.set(system, maskValue(value))
    }
  }

  return {
    found: true,
    identifierSystems: [...seen].map(([system, sampleMasked]) => ({ system, sampleMasked })),
  }
}
