import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import {
  classifyFhirStatus,
  documentReferenceFor,
  LOSPOR_RECORD_NUMBER_SYSTEM,
  postFhirResource,
} from "./ehr-transport-fhir"

/**
 * The transport reports what happened; the queue decides whether to repeat it.
 * Getting that classification wrong is what turns one bad message into a
 * clinical interface engine raising alerts until somebody switches the
 * integration off.
 */

const OPTIONS = { endpoint: "https://fhir.example/base", credential: "token-abc" }

function respond(status: number, headers: Record<string, string> = {}) {
  return vi.fn(async () => new Response(null, { status, headers })) as unknown as typeof fetch
}

describe("which failures are worth repeating", () => {
  it("does not repeat a refusal the far side understood", async () => {
    // A malformed resource, an unknown patient, a scope the credential lacks.
    // Repeating it is noise, and repeated rejects on an interface engine raise
    // alerts that get integrations switched off.
    for (const status of [400, 404, 409, 422]) {
      expect(classifyFhirStatus(status)).toMatchObject({ permanent: true })
    }
  })

  it("repeats an explicit not-now", async () => {
    for (const status of [408, 429]) {
      expect(classifyFhirStatus(status)).toMatchObject({ permanent: false })
    }
  })

  it("repeats an authorisation failure rather than giving up on it", async () => {
    // A credential rotated on their side is far more common than one that was
    // never right, and giving up permanently would need an operator to notice.
    expect(classifyFhirStatus(401)).toMatchObject({ permanent: false })
    expect(classifyFhirStatus(403)).toMatchObject({ permanent: false })
  })

  it("repeats a server error", async () => {
    for (const status of [500, 502, 503]) {
      expect(classifyFhirStatus(status)).toMatchObject({ permanent: false })
    }
  })
})

describe("sending a resource", () => {
  it("posts to the resource's own collection", async () => {
    const send = respond(201, { location: "DocumentReference/1" })
    const result = await postFhirResource(
      { resourceType: "DocumentReference" }, { ...OPTIONS, fetchImpl: send },
    )

    expect(result).toMatchObject({ ok: true, status: 201 })
    expect((send as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])
      .toBe("https://fhir.example/base/DocumentReference")
  })

  it("tolerates a trailing slash on the configured endpoint", async () => {
    const send = respond(201)
    await postFhirResource(
      { resourceType: "Observation" },
      { ...OPTIONS, endpoint: "https://fhir.example/base/", fetchImpl: send },
    )

    expect((send as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])
      .toBe("https://fhir.example/base/Observation")
  })

  it("sends the credential as a bearer token and nothing else", async () => {
    const send = respond(201)
    await postFhirResource({ resourceType: "DocumentReference" }, { ...OPTIONS, fetchImpl: send })

    const init = (send as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(init.headers.Authorization).toBe("Bearer token-abc")
    expect(init.headers["Content-Type"]).toBe("application/fhir+json")
  })

  it("treats a refused connection as worth retrying", async () => {
    // A hospital's internal CA being installed later is a normal course of
    // events, not a permanent misconfiguration.
    const send = vi.fn(async () => { throw new Error("ECONNREFUSED") }) as unknown as typeof fetch
    const result = await postFhirResource(
      { resourceType: "DocumentReference" }, { ...OPTIONS, fetchImpl: send },
    )

    expect(result).toEqual({ ok: false, permanent: false, errorCode: "UNREACHABLE" })
  })

  it("reports a timeout as a timeout", async () => {
    const send = vi.fn(async () => {
      const e = new Error("aborted"); e.name = "AbortError"; throw e
    }) as unknown as typeof fetch
    const result = await postFhirResource(
      { resourceType: "DocumentReference" }, { ...OPTIONS, fetchImpl: send, timeoutMs: 5 },
    )

    expect(result).toEqual({ ok: false, permanent: false, errorCode: "TIMEOUT" })
  })

  it("refuses a resource with no type rather than posting to the base URL", async () => {
    const send = respond(201)
    const result = await postFhirResource({}, { ...OPTIONS, fetchImpl: send })

    expect(result).toMatchObject({ ok: false, permanent: true, errorCode: "RESOURCE_TYPE_MISSING" })
    expect(send).not.toHaveBeenCalled()
  })
})

describe("the protocol as a DocumentReference", () => {
  const doc = () => documentReferenceFor({
    patient: { identifierType: "IZ", identifier: "42" },
    contentHtml: "<html>record</html>",
    createdAt: "2026-09-02T10:00:00.000Z",
    title: "Anaesthesia protocol",
  })

  /**
   * A number alone identifies nobody.
   *
   * "42" means nothing until you say it is an admission number, and whose. The
   * receiving hospital matches `subject.identifier` against namespaces it
   * knows, and LOSPOR's own OID is not one of them -- so a record labelled
   * with it files unlinked or is refused. Like labelling a specimen with your
   * own department's internal numbering: the number is right and nobody can
   * act on it.
   *
   * The system is the one the site already configured for the inbound patient
   * check. Asked once, used both ways.
   */
  it("labels the patient with the hospital's own numbering", () => {
    const resource = documentReferenceFor({
      patient: { identifierType: "IZ", identifier: "42" },
      contentHtml: "<html>record</html>",
      createdAt: "2026-09-02T10:00:00.000Z",
      title: "Anaesthesia protocol",
      identifierSystems: { recordNumber: "http://hospital.bg/iz" },
    })

    expect(resource).toMatchObject({
      subject: { identifier: { system: "http://hospital.bg/iz", value: "42" } },
    })
  })

  // ЕГН is a national register, not this hospital's admission numbering, so it
  // takes its own system rather than borrowing the record number's.
  it("uses the national system for a national identifier", () => {
    const resource = documentReferenceFor({
      patient: { identifierType: "EGN", identifier: "7403025678" },
      contentHtml: "<html>record</html>",
      createdAt: "2026-09-02T10:00:00.000Z",
      title: "Anaesthesia protocol",
      identifierSystems: {
        recordNumber: "http://hospital.bg/iz",
        national: "urn:oid:1.3.6.1.4.1.99999.egn",
      },
    })

    expect(resource).toMatchObject({
      subject: { identifier: { system: "urn:oid:1.3.6.1.4.1.99999.egn" } },
    })
  })

  // An unconfigured site behaves exactly as it did before this existed. The
  // fallback is not useful to a receiver, but it is what is already deployed
  // and changing it silently would be its own surprise.
  it("falls back to the LOSPOR system when a site has not said", () => {
    expect(doc()).toMatchObject({
      subject: { identifier: { system: LOSPOR_RECORD_NUMBER_SYSTEM } },
    })
  })

  it("carries the document inline rather than as a link back", async () => {
    // A hospital system reading this may have no route back to the appliance,
    // and a document that cannot be fetched is not a document.
    const content = doc().content as { attachment: { data: string; contentType: string } }[]

    expect(content[0].attachment.contentType).toBe("text/html")
    expect(Buffer.from(content[0].attachment.data, "base64").toString("utf8"))
      .toBe("<html>record</html>")
  })

  it("identifies the patient by the number the hospital knows them by", async () => {
    const subject = doc().subject as { identifier: { value: string; system: string } }

    expect(subject.identifier.value).toBe("42")
    expect(subject.identifier.system).toContain("1.1")
  })

  it("uses a different identifier system for a national identifier", async () => {
    // ИЗ № and ЕГН are different numbering spaces; one system for both would
    // let a record number collide with a national identifier.
    const egn = documentReferenceFor({
      patient: { identifierType: "EGN", identifier: "8001010008" },
      contentHtml: "<p/>", createdAt: "2026-09-02T10:00:00.000Z", title: "t",
    })
    const izSystem = (doc().subject as { identifier: { system: string } }).identifier.system
    const egnSystem = (egn.subject as { identifier: { system: string } }).identifier.system

    expect(egnSystem).not.toBe(izSystem)
  })

  it("codes it as an anaesthesia record but still names it in text", async () => {
    // A site that does not recognise the LOINC code still gets a title.
    const type = doc().type as { coding: { code: string }[]; text: string }

    expect(type.coding[0].code).toBe("34122-2")
    expect(type.text).toBe("Anaesthesia protocol")
  })
})
