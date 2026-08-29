import { describe, expect, it } from "vitest"
import {
  CORS_REQUEST_HEADERS,
  OPERATION_ID_HEADER,
  buildSectionRevisionHeaders,
  parseConflictBody,
  readBlockedSaveIssue,
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

describe("save rejections a retry cannot fix", () => {
  it("still reads a PII block and its own named field", () => {
    const issue = readBlockedSaveIssue({
      code: "PII_BLOCKED",
      field: "preop.diagnosis",
      reason: "likely_name",
      error: "That looks like a name.",
    })
    expect(issue).toMatchObject({
      code: "PII_BLOCKED",
      reason: "likely_name",
      retryable: false,
      blockedKeys: ["diagnosis"],
    })
  })

  // The exact 409 the API returns: a code and an error, with no field or
  // reason. Before this was recognized it fell through as an ordinary failure,
  // was re-stored as a pending patch, and the autosave manager relabelled it
  // "queued" -- so a deterministic refusal was shown as a network problem and
  // replayed unchanged forever.
  it.each([
    ["PEDIATRIC_MODE_REQUIRED", "clinicalMode"],
    ["ADULT_MODE_REQUIRED", "clinicalMode"],
    ["PEDIATRIC_AGE_REQUIRED", "ageValue"],
    ["INVALID_PEDIATRIC_AGE", "ageValue"],
  ])("recognizes %s as a validation blocker", (code, field) => {
    const issue = readBlockedSaveIssue({ error: code, allowed: false, status: 409, code })
    expect(issue).not.toBeNull()
    expect(issue).toMatchObject({ code, field, reason: code, retryable: false })
  })

  it("groups mode with the age fields so a save can quarantine just that cluster", () => {
    const issue = readBlockedSaveIssue({ code: "PEDIATRIC_MODE_REQUIRED", error: "PEDIATRIC_MODE_REQUIRED" })
    expect(issue?.blockedKeys).toEqual(["clinicalMode", "ageValue", "ageUnit", "ageYears"])
    const ageOnly = readBlockedSaveIssue({ code: "INVALID_PEDIATRIC_AGE", error: "INVALID_PEDIATRIC_AGE" })
    expect(ageOnly?.blockedKeys).toEqual(["ageValue", "ageUnit"])
  })

  it("never reports a domain refusal with the PII reason", () => {
    // Callers switch on `reason` to pick their copy. Reusing a PII reason here
    // would tell a clinician their age entry contains identifying information.
    const issue = readBlockedSaveIssue({ code: "PEDIATRIC_MODE_REQUIRED", error: "PEDIATRIC_MODE_REQUIRED" })
    expect(issue?.reason).toBe("PEDIATRIC_MODE_REQUIRED")
    expect(["egn", "long_number", "date", "email", "likely_name"]).not.toContain(issue?.reason)
  })

  // These stop being true without the clinician changing anything, so they stay
  // retryable rather than becoming a blocker the operator has to clear.
  it.each(["PEDIATRIC_MODE_DISABLED", "PEDIATRIC_CLIENT_UPDATE_REQUIRED", "SOMETHING_ELSE"])(
    "leaves %s retryable",
    code => {
      expect(readBlockedSaveIssue({ code, error: code })).toBeNull()
    },
  )

  it("ignores payloads that are not objects", () => {
    expect(readBlockedSaveIssue(null)).toBeNull()
    expect(readBlockedSaveIssue("PEDIATRIC_MODE_REQUIRED")).toBeNull()
    expect(readBlockedSaveIssue({ code: 42 })).toBeNull()
  })
})
