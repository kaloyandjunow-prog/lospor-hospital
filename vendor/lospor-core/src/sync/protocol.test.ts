import { describe, expect, it } from "vitest"
import {
  CORS_REQUEST_HEADERS,
  OPERATION_ID_HEADER,
  buildSectionRevisionHeaders,
  parseConflictBody,
  readSectionRevisionHeaders,
} from "./protocol"

describe("sync protocol", () => {
  it("builds revision and legacy timestamp headers", () => {
    expect(buildSectionRevisionHeaders("preop", 7)).toEqual({
      "x-lospor-preop-revision": "7",
    })
    expect(buildSectionRevisionHeaders("intraop", "2026-07-24T10:00:00.000Z")).toEqual({
      "x-lospor-intraop-updated-at": "2026-07-24T10:00:00.000Z",
    })
    expect(buildSectionRevisionHeaders("postop", null)).toEqual({})
  })

  it("prefers numeric response revisions and falls back to timestamps", () => {
    const values = new Map([
      ["x-lospor-intraop-revision", "9"],
      ["x-lospor-intraop-updated-at", "legacy"],
    ])
    expect(readSectionRevisionHeaders("intraop", { get: name => values.get(name) ?? null })).toBe(9)
    values.delete("x-lospor-intraop-revision")
    expect(readSectionRevisionHeaders("intraop", { get: name => values.get(name) ?? null })).toBe("legacy")
  })

  it("defines every autosave CORS header", () => {
    expect(CORS_REQUEST_HEADERS).toContain(OPERATION_ID_HEADER)
    expect(CORS_REQUEST_HEADERS).toContain("x-lospor-preop-revision")
    expect(CORS_REQUEST_HEADERS).toContain("X-Idempotency-Key")
  })

  it("parses conflict bodies without trusting invalid shapes", () => {
    expect(parseConflictBody(null)).toBeNull()
    expect(parseConflictBody({ error: "Conflict", serverVersion: { updatedAt: "now" } })).toEqual({
      error: "Conflict",
      reason: undefined,
      section: undefined,
      serverVersion: { updatedAt: "now" },
    })
  })
})
