import { describe, expect, it } from "vitest"
import { auditActionLabel, parseAuditPage } from "./audit-actions"

const valid = {
  schemaVersion: 1,
  actions: [{
    code: "HOSPITAL_ACCOUNT_CREATED",
    category: "ACCOUNT",
    labels: { bg: "Създаден болничен профил", en: "Hospital account created" },
  }],
  logs: [{
    id: "log-1",
    createdAt: "2026-08-23T12:00:00.000Z",
    action: "HOSPITAL_ACCOUNT_CREATED",
    entityId: "must-not-reach-the-component",
    detail: { patientNumber: "must-not-reach-the-component" },
    user: { name: "Operator" },
  }],
  total: 1,
  page: 0,
  pageSize: 50,
}

describe("Hospital Web audit contract", () => {
  it("parses the API-owned bilingual catalog and strips untrusted legacy fields", () => {
    const parsed = parseAuditPage(valid)
    expect(parsed?.actions).toHaveLength(1)
    expect(parsed?.logs).toEqual([{
      id: "log-1",
      createdAt: "2026-08-23T12:00:00.000Z",
      action: "HOSPITAL_ACCOUNT_CREATED",
      user: { name: "Operator", firstName: undefined, lastName: undefined, title: undefined },
    }])
    expect(JSON.stringify(parsed)).not.toContain("must-not-reach")
  })

  it("uses the selected language and a safe localized fallback", () => {
    const actions = parseAuditPage(valid)!.actions
    expect(auditActionLabel(actions, "HOSPITAL_ACCOUNT_CREATED", "bg", "Неизвестно действие"))
      .toBe("Създаден болничен профил")
    expect(auditActionLabel(actions, "HISTORIC_UNKNOWN", "en", "Unknown action"))
      .toBe("Unknown action")
  })

  it.each([
    { ...valid, schemaVersion: 2 },
    { ...valid, actions: [{ ...valid.actions[0], labels: { bg: "", en: "Label" } }] },
    { ...valid, actions: [valid.actions[0], valid.actions[0]] },
    { ...valid, logs: [{ ...valid.logs[0], createdAt: "not-a-date" }] },
    { ...valid, total: -1 },
  ])("fails closed for malformed contracts", payload => {
    expect(parseAuditPage(payload)).toBeNull()
  })
})
