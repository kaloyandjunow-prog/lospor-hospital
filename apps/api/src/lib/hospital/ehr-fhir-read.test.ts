import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { bundleEntries, fetchPatientResources, findFhirPatient } from "./ehr-fhir-read"

const OPTIONS = { endpoint: "https://fhir.example.org/r4", credential: "token" }

function json(body: unknown, status = 200): typeof fetch {
  return (async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch
}

const patientBundle = (...ids: string[]) => ({
  resourceType: "Bundle",
  entry: ids.map(id => ({ resource: { resourceType: "Patient", id } })),
})

describe("finding the patient a record number names", () => {
  it("returns the one match", async () => {
    const result = await findFhirPatient({ ...OPTIONS, identifier: "42", fetchImpl: json(patientBundle("p1")) })
    expect(result).toMatchObject({ found: true, patientId: "p1" })
  })

  it("refuses two matches rather than picking one", async () => {
    // The worst outcome available here is attaching a stranger's diagnoses to
    // this case, so a record number matching two patients is refused outright
    // instead of resolved.
    const result = await findFhirPatient({ ...OPTIONS, identifier: "42", fetchImpl: json(patientBundle("p1", "p2")) })
    expect(result).toEqual({ found: false, ambiguous: true })
  })

  it("searches on value alone, without an identifier system", async () => {
    // The same choice the discovery probe makes: asking an operator for an OID
    // they would have to get from their vendor is how an integration stalls.
    let seen = ""
    const spy = (async (url: string) => {
      seen = url
      return { ok: true, status: 200, json: async () => patientBundle("p1") }
    }) as unknown as typeof fetch
    await findFhirPatient({ ...OPTIONS, identifier: "42", fetchImpl: spy })
    expect(seen).toContain("identifier=42")
    expect(seen).not.toContain("system")
  })

  it("reports an unreachable server as unreachable, not as not-found", async () => {
    // A clinician told "no record" when the server is down would conclude the
    // patient has no history, which is a different and worse statement.
    const result = await findFhirPatient({ ...OPTIONS, identifier: "42", fetchImpl: json({}, 503) })
    expect(result).toMatchObject({ found: false, errorCode: expect.any(String) })
  })

  it("distinguishes an empty answer from a failure", async () => {
    const result = await findFhirPatient({ ...OPTIONS, identifier: "42", fetchImpl: json(patientBundle()) })
    expect(result).toEqual({ found: false })
  })
})

describe("fetching what hangs off the patient", () => {
  it("scopes the search to that patient", async () => {
    let seen = ""
    const spy = (async (url: string) => {
      seen = url
      return { ok: true, status: 200, json: async () => ({ entry: [] }) }
    }) as unknown as typeof fetch
    await fetchPatientResources({ ...OPTIONS, resourceType: "Condition", patientId: "p1", fetchImpl: spy })
    expect(seen).toContain("/Condition?")
    expect(seen).toContain("patient=p1")
  })

  it("yields nothing and a reason when one resource type fails", async () => {
    // A server that serves Observations but refuses Conditions should still
    // give up the labs: offering the half that arrived beats offering nothing
    // because one endpoint was misconfigured.
    const result = await fetchPatientResources({
      ...OPTIONS, resourceType: "Condition", patientId: "p1", fetchImpl: json({}, 403),
    })
    expect(result.resources).toEqual([])
    expect(result.errorCode).toBeTruthy()
  })
})

describe("reading a bundle", () => {
  it("ignores anything that is not a searchset with resources", () => {
    expect(bundleEntries(null)).toEqual([])
    expect(bundleEntries({ resourceType: "Bundle" })).toEqual([])
    expect(bundleEntries({ entry: [{}, { resource: null }] })).toEqual([])
  })
})
