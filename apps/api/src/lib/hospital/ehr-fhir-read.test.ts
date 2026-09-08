import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { bundleEntries, fetchPatientResources, findFhirEncounter, findFhirPatient } from "./ehr-fhir-read"

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

/** A searchset that hands out one observation per page. */
function pagedServer(dates: string[]) {
  const seen: string[] = []
  const impl = (async (url: string) => {
    seen.push(url)
    const page = Number(new URL(url).searchParams.get("page") ?? "0")
    const date = dates[page]
    if (date === undefined) return { ok: true, status: 200, json: async () => ({ entry: [] }) }
    const next = page + 1 < dates.length
      ? [{ relation: "next", url: `https://fhir.example.org/r4/Observation?page=${page + 1}` }]
      : []
    return {
      ok: true,
      status: 200,
      json: async () => ({
        resourceType: "Bundle",
        entry: [{ resource: { resourceType: "Observation", id: date, effectiveDateTime: date } }],
        link: next,
      }),
    }
  }) as unknown as typeof fetch
  return { impl, seen }
}

describe("keeping the newest results rather than the first page of them", () => {
  /**
   * `_count` is a hint. Servers cap a page where they like, commonly at 50, so
   * reading one bundle and stopping can take 50 of 400 without anything saying
   * so -- and the clinician sees a partial record presented as a whole one.
   */
  it("follows the server's next link", async () => {
    const { impl } = pagedServer([
      "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z", "2026-03-01T00:00:00Z",
    ])
    const result = await fetchPatientResources({
      ...OPTIONS, resourceType: "Observation", patientId: "p1", fetchImpl: impl,
    })
    expect(result.resources).toHaveLength(3)
  })

  /**
   * The failure this exists to prevent.
   *
   * No `_sort` was ever sent, and plenty of servers default to oldest first. A
   * cap applied to that order keeps the oldest results, Core then picks "the
   * most recent per test" from them, and a three-year-old haemoglobin is shown
   * as this patient's current one. Sorting here is what makes the cap keep the
   * right 300 rather than the first 300.
   */
  it("keeps the newest when the server ordered them oldest first", async () => {
    const { impl } = pagedServer([
      "2020-01-01T00:00:00Z", "2023-01-01T00:00:00Z", "2026-01-01T00:00:00Z",
    ])
    const result = await fetchPatientResources({
      ...OPTIONS, resourceType: "Observation", patientId: "p1", fetchImpl: impl, count: 1,
    })
    expect(result.resources[0]).toMatchObject({ id: "2026-01-01T00:00:00Z" })
    expect(result.truncated).toBe(true)
  })

  it("asks the server to sort too, so paging starts at the right end", async () => {
    const { impl, seen } = pagedServer([])
    await fetchPatientResources({
      ...OPTIONS, resourceType: "Observation", patientId: "p1", fetchImpl: impl,
    })
    expect(seen[0]).toContain("_sort=-date")
  })

  /**
   * The next link is content from the response, and following it is a
   * server-side request carrying the bearer token. A tampered or
   * proxy-mangled link pointing elsewhere must not be dialled.
   */
  it("refuses to follow a next link to another host", async () => {
    const dialled: string[] = []
    const impl = (async (url: string) => {
      dialled.push(url)
      return {
        ok: true, status: 200,
        json: async () => ({
          entry: [{ resource: { resourceType: "Observation", id: "o1" } }],
          link: [{ relation: "next", url: "https://elsewhere.example.net/steal" }],
        }),
      }
    }) as unknown as typeof fetch

    await fetchPatientResources({
      ...OPTIONS, resourceType: "Observation", patientId: "p1", fetchImpl: impl,
    })
    expect(dialled).toHaveLength(1)
    expect(dialled.join(" ")).not.toContain("elsewhere.example.net")
  })
})

describe("scoping to the admission the record number names", () => {
  it("finds the encounter carrying that number", async () => {
    const bundle = {
      resourceType: "Bundle",
      entry: [{ resource: { resourceType: "Encounter", id: "e1" } }],
    }
    const found = await findFhirEncounter({
      ...OPTIONS, patientId: "p1", identifier: "42", fetchImpl: json(bundle),
    })
    expect(found).toBe("e1")
  })

  // ИЗ № restarts every January, so two encounters carrying it are two
  // admissions. Choosing between them would attach another stay's results to
  // this case; the caller falls back to a date window instead.
  it("declines to choose between two admissions", async () => {
    const bundle = {
      resourceType: "Bundle",
      entry: [
        { resource: { resourceType: "Encounter", id: "e1" } },
        { resource: { resourceType: "Encounter", id: "e2" } },
      ],
    }
    expect(await findFhirEncounter({
      ...OPTIONS, patientId: "p1", identifier: "42", fetchImpl: json(bundle),
    })).toBeNull()
  })

  // A server with no Encounter support is ordinary, not broken.
  it("treats a server without encounters as simply unscoped", async () => {
    expect(await findFhirEncounter({
      ...OPTIONS, patientId: "p1", identifier: "42", fetchImpl: json({}, 404),
    })).toBeNull()
  })

  it("scopes the search to that admission when one was found", async () => {
    let seen = ""
    const spy = (async (url: string) => {
      seen = url
      return { ok: true, status: 200, json: async () => ({ entry: [] }) }
    }) as unknown as typeof fetch
    await fetchPatientResources({
      ...OPTIONS, resourceType: "Observation", patientId: "p1", encounterId: "e1", fetchImpl: spy,
    })
    expect(seen).toContain("encounter=e1")
  })

  it("falls back to a date window when there is no encounter", async () => {
    let seen = ""
    const spy = (async (url: string) => {
      seen = url
      return { ok: true, status: 200, json: async () => ({ entry: [] }) }
    }) as unknown as typeof fetch
    await fetchPatientResources({
      ...OPTIONS, resourceType: "Observation", patientId: "p1", since: "2026-01-01", fetchImpl: spy,
    })
    expect(decodeURIComponent(seen)).toContain("date=ge2026-01-01")
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

/**
 * A searchset may state its next link relative to the base — `?page=2`, or
 * `/fhir/Observation?_getpages=…`. Parsing that without a base threw, and the
 * throw read as a foreign origin, so paging stopped at page one for every
 * server that writes them that way and the short list looked complete.
 */
describe("following a relative next link", () => {
  function relativeServer() {
    const dialled: string[] = []
    const impl = (async (url: string) => {
      dialled.push(url)
      const page = Number(new URL(url, "https://fhir.example.org").searchParams.get("page") ?? "0")
      return {
        ok: true, status: 200,
        json: async () => ({
          resourceType: "Bundle",
          entry: [{ resource: { resourceType: "Observation", id: `o${page}`, effectiveDateTime: "2026-09-04T07:00:00Z" } }],
          link: page < 2 ? [{ relation: "next", url: `?page=${page + 1}` }] : [],
        }),
      }
    }) as unknown as typeof fetch
    return { impl, dialled }
  }

  it("resolves it against the endpoint and keeps paging", async () => {
    const { impl } = relativeServer()
    const result = await fetchPatientResources({
      ...OPTIONS, resourceType: "Observation", patientId: "p1", fetchImpl: impl,
    })
    expect(result.resources).toHaveLength(3)
  })

  // Still refused when it resolves somewhere else: the link is response
  // content, and following it carries the bearer token.
  it("refuses one that resolves to another host", async () => {
    const dialled: string[] = []
    const impl = (async (url: string) => {
      dialled.push(url)
      return {
        ok: true, status: 200,
        json: async () => ({
          entry: [{ resource: { resourceType: "Observation", id: "o1" } }],
          link: [{ relation: "next", url: "//elsewhere.example.net/steal" }],
        }),
      }
    }) as unknown as typeof fetch

    const result = await fetchPatientResources({
      ...OPTIONS, resourceType: "Observation", patientId: "p1", fetchImpl: impl,
    })
    expect(dialled).toHaveLength(1)
    expect(result.truncated).toBe(true)
  })
})
