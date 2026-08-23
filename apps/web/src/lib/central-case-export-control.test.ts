import { describe, expect, it } from "vitest"
import {
  centralCaseExportControlUrl,
  parseCentralCaseExportControl,
  parseCentralDeliveryCaseList,
} from "./central-case-export-control"

function validControl() {
  return {
    schemaVersion: 2,
    state: "ACCEPTED",
    decidedAt: "2026-08-23T08:15:00.000Z",
    lastBatch: {
      status: "ACCEPTED",
      action: "UPSERT",
      acceptedAt: "2026-08-23T08:20:00.000Z",
      errorCode: null,
    },
    canWithdraw: true,
    canResend: false,
  }
}

describe("Central per-case export contract", () => {
  it("accepts the complete schemaVersion 2 automatic-delivery response", () => {
    expect(parseCentralCaseExportControl(validControl())).toEqual(validControl())
  })

  it("accepts the API's safe nullable delivery fields", () => {
    const value = {
      ...validControl(),
      lastBatch: {
        ...validControl().lastBatch,
        action: null,
        acceptedAt: null,
        errorCode: "CENTRAL_REJECTED",
      },
    }

    expect(parseCentralCaseExportControl(value)).not.toBeNull()
  })

  it.each([
    ["future schema", { ...validControl(), schemaVersion: 3 }],
    ["unknown state", { ...validControl(), state: "SENT" }],
    ["unbounded delivery status", { ...validControl(), lastBatch: { ...validControl().lastBatch, status: "SECRET" } }],
    ["invalid decision timestamp", { ...validControl(), decidedAt: "yesterday" }],
    ["raw server error", { ...validControl(), lastBatch: { ...validControl().lastBatch, errorCode: "connection failed: patient 42" } }],
  ])("rejects %s", (_label, value) => {
    expect(parseCentralCaseExportControl(value)).toBeNull()
  })

  it.each([
    ["patient identifier", { ...validControl(), patientIdentifier: "HOSP-PRIVATE-001" }],
    ["case pseudonym", { ...validControl(), casePseudonym: "central-pseudo-1" }],
    ["audit detail", { ...validControl(), auditDetail: "free text from the operator" }],
    ["raw batch id", { ...validControl(), lastBatch: { ...validControl().lastBatch, batchId: "batch-secret-1" } }],
  ])("fails closed when a response includes a %s", (_label, value) => {
    expect(parseCentralCaseExportControl(value)).toBeNull()
  })

  it("encodes the internal case route key", () => {
    expect(centralCaseExportControlUrl("case/with spaces")).toBe(
      "/api/hospital/cases/case%2Fwith%20spaces/export-control",
    )
  })

  it("accepts only the privacy-minimal paginated discovery model", () => {
    const value = {
      schemaVersion: 1,
      cases: [{
        caseId: "case-1",
        finalizedAt: "2026-08-23T10:00:00.000Z",
        control: validControl(),
      }],
      page: 0,
      pageSize: 20,
      total: 1,
    }
    expect(parseCentralDeliveryCaseList(value)).toEqual(value)
    expect(parseCentralDeliveryCaseList({
      ...value,
      cases: [{ ...value.cases[0], patientNumber: "secret" }],
    })).toBeNull()
    expect(parseCentralDeliveryCaseList({ ...value, batchId: "private" })).toBeNull()
  })
})
