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

/**
 * A hospital numbers the same person several ways -- admission number,
 * permanent record number, ward number, visit number -- and those are separate
 * namespaces holding numbers of the same shape. Two sequential counters
 * reaching the same value is not exotic; over a year of admissions it is close
 * to certain.
 *
 * Several matches were already refused. The gap was a single match belonging to
 * a different numbering, which is accepted as a clean hit -- and then a
 * stranger's diagnoses, allergies and medications are proposed onto this case
 * with nothing on the screen suggesting anything went wrong.
 */
describe("a match has to be the right kind of number, not just the right number", () => {
  const ADMISSION = "urn:oid:2.16.100.1.1.3"
  const WARD = "urn:oid:2.16.100.1.1.9"

  const patient = (identifiers: { system: string; value: string }[]) => json({
    resourceType: "Bundle",
    entry: [{ resource: { resourceType: "Patient", id: "p1", identifier: identifiers } }],
  })

  it("accepts a patient carrying that value as a record number", async () => {
    const found = await findFhirPatient({
      ...OPTIONS,
      identifier: "12345",
      recordNumberSystem: ADMISSION,
      fetchImpl: patient([{ system: ADMISSION, value: "12345" }]),
    })

    expect(found).toMatchObject({ found: true, patientId: "p1" })
  })

  it("refuses a patient whose 12345 is a different kind of number", async () => {
    // The wrong-patient import, and it looks identical to a clean hit from
    // here: one result, no ambiguity, a real patient.
    const found = await findFhirPatient({
      ...OPTIONS,
      identifier: "12345",
      recordNumberSystem: ADMISSION,
      fetchImpl: patient([{ system: WARD, value: "12345" }]),
    })

    expect(found).toMatchObject({ found: false, wrongIdentifierSystem: true })
  })

  it("is not satisfied by the right system holding a different value", async () => {
    // Checking the system alone would accept any inpatient, since every one of
    // them has an admission number.
    const found = await findFhirPatient({
      ...OPTIONS,
      identifier: "12345",
      recordNumberSystem: ADMISSION,
      fetchImpl: patient([{ system: ADMISSION, value: "99999" }]),
    })

    expect(found).toMatchObject({ found: false, wrongIdentifierSystem: true })
  })

  it("accepts when the patient carries several numbers and one is the right one", async () => {
    const found = await findFhirPatient({
      ...OPTIONS,
      identifier: "12345",
      recordNumberSystem: ADMISSION,
      fetchImpl: patient([
        { system: WARD, value: "7" },
        { system: ADMISSION, value: "12345" },
      ]),
    })

    expect(found).toMatchObject({ found: true, patientId: "p1" })
  })

  /**
   * A site has to be able to import before it has answered which numbering its
   * record numbers use -- it cannot answer that without seeing real traffic.
   * So an unconfigured appliance keeps working and says the identity is
   * unverified, which is a different statement from silence.
   */
  it("returns the match unverified when nobody has said which numbering to expect", async () => {
    const found = await findFhirPatient({
      ...OPTIONS,
      identifier: "12345",
      fetchImpl: patient([{ system: WARD, value: "12345" }]),
    })

    expect(found).toMatchObject({ found: true, patientId: "p1", identitySystemUnverified: true })
  })

  it("still refuses two matches, configured or not", async () => {
    const two = json({
      resourceType: "Bundle",
      entry: [
        { resource: { resourceType: "Patient", id: "p1" } },
        { resource: { resourceType: "Patient", id: "p2" } },
      ],
    })

    expect(await findFhirPatient({ ...OPTIONS, identifier: "12345", fetchImpl: two }))
      .toMatchObject({ found: false, ambiguous: true })
  })
})
