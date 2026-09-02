import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import {
  discoverFhirCapabilities,
  probeFhirIdentifierSystems,
} from "./ehr-fhir-discovery"

/**
 * Configuring a FHIR integration by asking the server rather than asking their
 * integration team.
 *
 * The alternative is a screen of free text an operator has to get exactly
 * right, where a wrong identifier system fails silently: a DocumentReference
 * whose subject uses a system the server does not recognise matches no patient
 * and raises nothing at all.
 */

const OPTIONS = { endpoint: "https://fhir.example/base", credential: "token" }

function json(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/fhir+json" },
  })) as unknown as typeof fetch
}

const CAPABILITY = {
  resourceType: "CapabilityStatement",
  fhirVersion: "4.0.1",
  software: { name: "HAPI FHIR Server" },
  rest: [{
    mode: "server",
    resource: [
      { type: "Patient" }, { type: "Observation" },
      { type: "Condition" }, { type: "MedicationRequest" },
    ],
  }],
}

describe("asking the server what it is", () => {
  it("reads the version and the software from the CapabilityStatement", async () => {
    const result = await discoverFhirCapabilities({ ...OPTIONS, fetchImpl: json(CAPABILITY) })

    expect(result.reachable).toBe(true)
    expect(result.fhirVersion).toBe("4.0.1")
    expect(result.software).toBe("HAPI FHIR Server")
  })

  it("asks the standard metadata endpoint", async () => {
    const send = json(CAPABILITY)
    await discoverFhirCapabilities({ ...OPTIONS, fetchImpl: send })

    expect(String((send as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]))
      .toBe("https://fhir.example/base/metadata")
  })

  it("reports which of the resources we want this server actually serves", async () => {
    // Some servers expose MedicationRequest and no MedicationStatement, or no
    // AllergyIntolerance at all. Guessing wrong means an inbound pull that
    // silently returns nothing.
    const result = await discoverFhirCapabilities({ ...OPTIONS, fetchImpl: json(CAPABILITY) })

    expect(result.supports).toEqual({
      patient: true,
      observation: true,
      condition: true,
      allergyIntolerance: false,
      medicationStatement: false,
      medicationRequest: true,
    })
  })

  it("says plainly when it cannot reach the server", async () => {
    const send = vi.fn(async () => { throw new Error("ECONNREFUSED") }) as unknown as typeof fetch
    const result = await discoverFhirCapabilities({ ...OPTIONS, fetchImpl: send })

    expect(result).toMatchObject({ reachable: false, errorCode: "UNREACHABLE" })
  })

  it("says plainly when the credential is refused", async () => {
    // The single most common reason an integration does not work, and the one
    // an operator can act on immediately.
    const result = await discoverFhirCapabilities({ ...OPTIONS, fetchImpl: json({}, 401) })

    expect(result).toMatchObject({ reachable: false, errorCode: "HTTP_401" })
  })

  it("survives a server that answers with something unexpected", async () => {
    const result = await discoverFhirCapabilities({ ...OPTIONS, fetchImpl: json({ hello: "world" }) })

    expect(result.reachable).toBe(true)
    expect(result.fhirVersion).toBeNull()
    expect(result.resources).toEqual([])
  })
})

describe("learning their identifier system from a real patient", () => {
  const BUNDLE = {
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "Patient",
        identifier: [
          { system: "http://hospital.bg/mrn", value: "000042" },
          { system: "http://hospital.bg/egn", value: "8001010008" },
        ],
      },
    }],
  }

  it("reads the systems off the patient rather than being told them", async () => {
    // The whole trick: instead of an operator typing an OID they would have to
    // get from their vendor, the server names its own systems and the operator
    // only has to recognise which is the record number.
    const result = await probeFhirIdentifierSystems({
      ...OPTIONS, identifier: "000042", fetchImpl: json(BUNDLE),
    })

    expect(result.found).toBe(true)
    expect(result.identifierSystems.map(s => s.system))
      .toEqual(["http://hospital.bg/mrn", "http://hospital.bg/egn"])
  })

  it("searches on the value alone, because the system is what we are looking for", async () => {
    const send = json(BUNDLE)
    await probeFhirIdentifierSystems({ ...OPTIONS, identifier: "000042", fetchImpl: send })

    const url = String((send as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(url).toContain("/Patient?")
    expect(url).toContain("identifier=000042")
    expect(url).not.toContain("%7C")
  })

  it("masks the values it shows back", async () => {
    // Configuring an integration is not a reason to put a patient's record
    // number, or their national identifier, on a settings screen.
    const result = await probeFhirIdentifierSystems({
      ...OPTIONS, identifier: "000042", fetchImpl: json(BUNDLE),
    })

    expect(result.identifierSystems[0].sampleMasked).toBe("00****")
    expect(JSON.stringify(result)).not.toContain("8001010008")
  })

  it("says so when nothing matched, rather than looking like a failure", async () => {
    // A wrong test identifier and an unreachable server need different
    // responses from the operator.
    const result = await probeFhirIdentifierSystems({
      ...OPTIONS, identifier: "nope", fetchImpl: json({ resourceType: "Bundle", entry: [] }),
    })

    expect(result).toEqual({ found: false, identifierSystems: [] })
  })

  it("reports an unreachable server distinctly from no match", async () => {
    const send = vi.fn(async () => { throw new Error("ECONNREFUSED") }) as unknown as typeof fetch
    const result = await probeFhirIdentifierSystems({
      ...OPTIONS, identifier: "000042", fetchImpl: send,
    })

    expect(result).toMatchObject({ found: false, errorCode: "UNREACHABLE" })
  })
})
