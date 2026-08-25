import { describe, expect, it } from "vitest"
import { auditActionLabel, parseAuditPage } from "./audit-actions"

const response = {
  schemaVersion: 1,
  actions: [{ code: "CASE_CREATE", category: "CASE", labels: { bg: "Създаден случай", en: "Case created" } }],
  logs: [{
    id: "audit-1", createdAt: "2026-08-23T12:00:00.000Z", action: "CASE_CREATE",
    entityId: "private-id", detail: { patientNumber: "private-number" }, user: { name: null },
  }],
  total: 1, page: 0, pageSize: 50,
}

describe("Hospital PWA audit contract", () => {
  it("uses the API catalog and drops legacy detail/entity fields", () => {
    const parsed = parseAuditPage(response)
    expect(parsed?.logs[0]).toEqual({
      id: "audit-1", createdAt: "2026-08-23T12:00:00.000Z", action: "CASE_CREATE",
      user: { name: null, firstName: undefined, lastName: undefined, title: undefined },
    })
    expect(JSON.stringify(parsed)).not.toContain("private-")
    expect(auditActionLabel(parsed!.actions, "CASE_CREATE", "bg", "Неизвестно"))
      .toBe("Създаден случай")
  })

  it.each([
    { ...response, schemaVersion: 0 },
    { ...response, actions: [response.actions[0], response.actions[0]] },
    { ...response, actions: [{ ...response.actions[0], category: "UNKNOWN" }] },
    { ...response, logs: [{ ...response.logs[0], createdAt: "invalid" }] },
    { ...response, pageSize: -1 },
  ])("fails closed when the contract is malformed", value => {
    expect(parseAuditPage(value)).toBeNull()
  })

  it("uses a localized fallback without displaying an unknown raw code", () => {
    const parsed = parseAuditPage(response)!
    expect(auditActionLabel(parsed.actions, "LEGACY_UNKNOWN", "en", "Unknown historical action"))
      .toBe("Unknown historical action")
  })
})
