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
