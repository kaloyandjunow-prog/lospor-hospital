import { describe, expect, it } from "vitest"
import { AUDIT_ACTION_REGISTRY, isAuditActionCode } from "./audit-actions"

describe("Hospital audit action registry", () => {
  it("has unique append-only codes and complete Bulgarian/English labels", () => {
    const codes = AUDIT_ACTION_REGISTRY.map(action => action.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes.length).toBeGreaterThanOrEqual(70)
    for (const action of AUDIT_ACTION_REGISTRY) {
      expect(action.code).toMatch(/^(?:[A-Z][A-Z0-9_]+|maintenance\.[a-z0-9_.]+)$/)
      expect(action.labels.bg.trim().length).toBeGreaterThan(2)
      expect(action.labels.en.trim().length).toBeGreaterThan(2)
      expect(isAuditActionCode(action.code)).toBe(true)
    }
  })

  it("covers Hospital-specific account, Central, clinical-rule, and research evidence", () => {
    const codes: ReadonlySet<string> = new Set(AUDIT_ACTION_REGISTRY.map(action => action.code))
    for (const code of [
      "HOSPITAL_ACCOUNT_CREATED",
      "HOSPITAL_ACCOUNT_ACTIVATED",
      "HOSPITAL_EXTERNAL_AI_POLICY_UPDATE",
      "HOSPITAL_CENTRAL_TRANSPORT_CONFIGURE",
      "CASE_CENTRAL_EXPORT_DECISION",
      "CASE_CENTRAL_DELIVERY_ACTION",
      "CLINICAL_RULESET_PUBLISH",
      "HOSPITAL_RESEARCH_GRANT_ISSUE",
      "HOSPITAL_OMOP_EXPORT_APPROVE",
      "LEGAL_ACCEPTANCE_RECORD",
      "ADMIN_ACCOUNT_AUTHORITY_CHANGE",
    ]) {
      expect(codes.has(code), code).toBe(true)
    }
  })

  it("fails closed for unknown filter codes", () => {
    expect(isAuditActionCode("HOSPITAL_ACCOUNT_CREATED")).toBe(true)
    expect(isAuditActionCode("HOSPITAL_ACCOUNT_CREATED_V2")).toBe(false)
    expect(isAuditActionCode("")).toBe(false)
  })
})
