import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

process.env.LOSPOR_AUTH_SECRET ??= "test-secret-not-for-production"

import { renderPrintableRecord } from "./ehr-printable-record"

/**
 * The document a hospital files is the printable record — the same page a
 * clinician prints, fetched and passed on. A summary maintained beside the
 * print page drifts from it, and nobody notices until a hospital is filing
 * something the anaesthetist has never seen.
 */

const BASE = "http://web:3000"

function respond(status: number, body = "<html>record</html>") {
  return vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch
}

describe("fetching the printable record", () => {
  it("asks the print page for this case, with a token", async () => {
    const send = respond(200)
    const result = await renderPrintableRecord({
      caseId: "case-1", deliveryId: "d-1", fetchImpl: send, baseUrl: BASE,
    })

    expect(result).toEqual({ ok: true, html: "<html>record</html>" })
    const url = String((send as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(url).toContain("/cases/case-1/print")
    expect(url).toContain("print_token=")
  })

  it("goes over the internal network, not the public domain", async () => {
    // Works before TLS is configured, does not depend on the reverse proxy,
    // and never leaves the appliance on its way between containers.
    const send = respond(200)
    await renderPrintableRecord({
      caseId: "case-1", deliveryId: "d-1", fetchImpl: send, baseUrl: BASE,
    })

    expect(String((send as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])
      .startsWith("http://web:3000/")).toBe(true)
  })
})

describe("which failures are worth repeating", () => {
  it("keeps trying when the web container is not up", async () => {
    // A protocol that arrives late is a great deal better than one dropped
    // because a container was cycling after an update.
    const send = vi.fn(async () => { throw new Error("ECONNREFUSED") }) as unknown as typeof fetch
    const result = await renderPrintableRecord({
      caseId: "case-1", deliveryId: "d-1", fetchImpl: send, baseUrl: BASE,
    })

    expect(result).toEqual({ ok: false, permanent: false, errorCode: "PRINT_UNREACHABLE" })
  })

  it("gives up when the case is gone, because nothing will bring it back", async () => {
    const result = await renderPrintableRecord({
      caseId: "case-1", deliveryId: "d-1", fetchImpl: respond(404), baseUrl: BASE,
    })

    expect(result).toMatchObject({ ok: false, permanent: true })
  })

  it("retries a server error", async () => {
    const result = await renderPrintableRecord({
      caseId: "case-1", deliveryId: "d-1", fetchImpl: respond(500), baseUrl: BASE,
    })

    expect(result).toMatchObject({ ok: false, permanent: false })
  })

  it("refuses an empty page rather than filing a blank protocol", async () => {
    // A 200 with nothing in it would otherwise be sent as the anaesthetic
    // record, and a blank document filed against a patient is worse than none.
    const result = await renderPrintableRecord({
      caseId: "case-1", deliveryId: "d-1", fetchImpl: respond(200, "   "), baseUrl: BASE,
    })

    expect(result).toEqual({ ok: false, permanent: false, errorCode: "PRINT_EMPTY" })
  })

  it("reports a timeout as a timeout", async () => {
    const send = vi.fn(async () => {
      const e = new Error("aborted"); e.name = "AbortError"; throw e
    }) as unknown as typeof fetch
    const result = await renderPrintableRecord({
      caseId: "case-1", deliveryId: "d-1", fetchImpl: send, baseUrl: BASE, timeoutMs: 5,
    })

    expect(result).toEqual({ ok: false, permanent: false, errorCode: "PRINT_TIMEOUT" })
  })
})
