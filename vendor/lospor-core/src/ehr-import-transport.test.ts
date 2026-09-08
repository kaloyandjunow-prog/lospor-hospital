import { describe, expect, it, vi } from "vitest"
import {
  lookupEhrImport,
  readEhrImportResponse,
  recordEhrDecisions,
} from "./ehr-import-transport"

const plan = { items: [], preselectedKeys: [], supersededCountByTest: {}, discardedOlderByTest: {} }

describe("reading what the route answered", () => {
  it("treats an ambiguous patient as its own answer, not a failure", () => {
    // The one outcome a clinician can act on: the number is wrong, or it needs
    // the other identifier. Collapsing it into a generic failure would send
    // somebody to check the network when they should check the number.
    expect(readEhrImportResponse(409, { code: "PATIENT_AMBIGUOUS" }))
      .toEqual({ status: "ambiguous" })
  })

  it("treats any other 409 as unavailable, carrying the code", () => {
    expect(readEhrImportResponse(409, { code: "EGN_DISABLED_BY_POLICY" }))
      .toEqual({ status: "unavailable", code: "EGN_DISABLED_BY_POLICY" })
  })

  it("distinguishes the hospital holding nothing from a failure", () => {
    // A clinician told "no record" when the server is down would conclude the
    // patient has no history, which is a different and worse statement.
    expect(readEhrImportResponse(200, { pending: false })).toEqual({ status: "none" })
    expect(readEhrImportResponse(503, null)).toEqual({ status: "unavailable", code: undefined })
  })

  it("reads an offer", () => {
    const result = readEhrImportResponse(200, {
      pending: true, importId: "i1", maskedIdentifier: "42**", receivedAt: "2026-09-04T08:00:00Z", plan,
    })
    expect(result).toMatchObject({ status: "offer", offer: { importId: "i1", maskedIdentifier: "42**" } })
  })

  /**
   * The flag has to survive the parse, because the screen that shows it is
   * three hops from the server that knows it. A boolean quietly dropped here
   * is a review screen that says nothing, which is indistinguishable from a
   * verified match.
   */
  it("carries an unverified identity through to the offer", () => {
    const result = readEhrImportResponse(200, {
      pending: true, importId: "i1", maskedIdentifier: "42**",
      receivedAt: "2026-09-04T08:00:00Z", identityUnverified: true, plan,
    })
    expect(result).toMatchObject({ status: "offer", offer: { identityUnverified: true } })
  })

  // Anything other than the server saying so reads as verified. A missing
  // field means an appliance that predates the check, not a warning to raise.
  /**
   * The half that did not arrive has to travel with the half that did.
   *
   * An allergy fetch that failed produces the same empty list as a patient
   * with no allergies. Only this distinguishes them, and it is the direction
   * where being wrong is dangerous rather than merely unhelpful.
   */
  it("carries what could not be read", () => {
    const result = readEhrImportResponse(200, {
      pending: true, importId: "i1", maskedIdentifier: "42**",
      receivedAt: "2026-09-04T08:00:00Z", plan,
      unreadSources: [{ group: "allergies", errorCode: "HTTP_503" }],
    })
    expect(result).toMatchObject({ offer: { unreadSources: [{ group: "allergies" }] } })
  })

  // A group name this build does not know is dropped, not shown: a warning a
  // clinician cannot act on is worse than no warning.
  it("ignores a group it does not recognise", () => {
    const result = readEhrImportResponse(200, {
      pending: true, importId: "i1", maskedIdentifier: "42**",
      receivedAt: "2026-09-04T08:00:00Z", plan,
      unreadSources: [{ group: "horoscopes", errorCode: "HTTP_503" }],
    })
    expect(result).toMatchObject({ offer: { unreadSources: [] } })
  })

  // An appliance older than the field says nothing, which means what it meant
  // before the field existed: everything was read.
  it("reads an older appliance as nothing missing", () => {
    const result = readEhrImportResponse(200, {
      pending: true, importId: "i1", maskedIdentifier: "42**",
      receivedAt: "2026-09-04T08:00:00Z", plan,
    })
    expect(result).toMatchObject({ offer: { unreadSources: [] } })
  })

  it("treats a missing flag as a verified match", () => {
    const result = readEhrImportResponse(200, {
      pending: true, importId: "i1", maskedIdentifier: "42**",
      receivedAt: "2026-09-04T08:00:00Z", plan,
    })
    expect(result).toMatchObject({ status: "offer", offer: { identityUnverified: false } })
  })
})

describe("asking", () => {
  it("sends the identifier and its type, and nothing else", () => {
    // The record number goes into one query and is gone. It never reaches
    // storage, a draft, an error or a log.
    let seen = ""
    const fetcher = vi.fn(async (path: string) => {
      seen = path
      return { status: 200, json: async () => ({ pending: false }) } as { status: number; json: () => Promise<unknown> }
    })
    return lookupEhrImport(fetcher, { caseId: "c1", identifier: " 42 ", identifierType: "EGN" })
      .then(() => {
        expect(seen).toContain("identifier=42")
        expect(seen).toContain("identifierType=EGN")
      })
  })

  it("asks nothing without a case or a number", async () => {
    const fetcher = vi.fn()
    expect(await lookupEhrImport(fetcher, { caseId: "", identifier: "42" })).toEqual({ status: "none" })
    expect(await lookupEhrImport(fetcher, { caseId: "c1", identifier: "  " })).toEqual({ status: "none" })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("survives an unreachable appliance without throwing", async () => {
    // Manual entry is the path that always works and is already on screen.
    const fetcher = vi.fn(async () => { throw new Error("offline") })
    expect(await lookupEhrImport(fetcher, { caseId: "c1", identifier: "42" }))
      .toEqual({ status: "unavailable" })
  })
})

describe("recording decisions", () => {
  it("always sends both lists, so an omitted one is not read as a refusal", async () => {
    const fetcher = vi.fn(async () => ({ status: 200, json: async () => ({}) } as { status: number; json: () => Promise<unknown> }))
    await recordEhrDecisions(fetcher, { caseId: "c1", importId: "i1", declinedKeys: ["k"] })
    const init = (fetcher.mock.calls[0] as unknown[])[1] as { body?: string }
    const body = JSON.parse(init.body ?? "{}")
    expect(body).toEqual({ importId: "i1", acceptedKeys: [], declinedKeys: ["k"] })
  })

  it("does not throw when the write fails", async () => {
    // The clinical value is already saved by this point; losing the bookkeeping
    // leaves the import pending, which self-corrects on the next look.
    const fetcher = vi.fn(async () => { throw new Error("offline") })
    await expect(recordEhrDecisions(fetcher, { caseId: "c1", importId: "i1" })).resolves.toBeUndefined()
  })
})
