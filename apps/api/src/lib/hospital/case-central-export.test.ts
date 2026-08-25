import { describe, expect, it } from "vitest"
import { projectCaseCentralExport } from "./case-central-export"

const date = new Date("2026-08-23T10:00:00.000Z")
const base = {
  centralExportControl: null,
  centralExportCheckpoint: null,
  centralExportRejection: null,
  centralDeliveryCases: [],
}

describe("the safe per-case Central projection", () => {
  it("distinguishes automatic, accepted, withdrawn, and resendable cases", () => {
    expect(projectCaseCentralExport(base)).toMatchObject({
      schemaVersion: 2,
      state: "NEVER_EXPORTED",
      canWithdraw: false,
      canResend: false,
    })
    expect(projectCaseCentralExport({
      ...base,
      centralExportControl: { decision: "EXCLUDE", decidedAt: date },
    })).toMatchObject({ state: "WITHDRAWN", canResend: true })
    expect(projectCaseCentralExport({
      ...base,
      centralExportCheckpoint: { lastAction: "UPSERT", acceptedAt: date },
    })).toMatchObject({ state: "ACCEPTED", canWithdraw: true, canResend: false })
    expect(projectCaseCentralExport({
      ...base,
      centralExportCheckpoint: { lastAction: "WITHDRAW", acceptedAt: date },
    })).toMatchObject({ state: "WITHDRAWN", canWithdraw: false, canResend: true })
  })

  it("keeps a requested withdrawal pending until a signed acceptance exists", () => {
    expect(projectCaseCentralExport({
      ...base,
      centralExportControl: {
        decision: "WITHDRAW_REQUESTED", decidedAt: date,
      },
      centralExportCheckpoint: { lastAction: "UPSERT", acceptedAt: date },
      centralDeliveryCases: [{
        action: "WITHDRAW",
        batch: { status: "AWAITING_RECEIPT", acceptedAt: null, errorCode: null },
      }],
    })).toMatchObject({ state: "WITHDRAWAL_PENDING", canWithdraw: false, canResend: false })
  })

  it("reports active delivery and signed rejection without returning arbitrary text", () => {
    expect(projectCaseCentralExport({
      ...base,
      centralDeliveryCases: [{
        action: "UPSERT",
        batch: { status: "UPLOADING", acceptedAt: null, errorCode: null },
      }],
    }).state).toBe("QUEUED")

    const rejected = projectCaseCentralExport({
      ...base,
      centralExportRejection: { errorCode: "patient 123: invalid" },
      centralDeliveryCases: [{
        action: "unexpected action",
        batch: { status: "REJECTED", acceptedAt: null, errorCode: "patient 123: invalid" },
      }],
    })
    expect(rejected).toMatchObject({
      state: "REJECTED",
      lastBatch: { action: null, errorCode: "CENTRAL_REJECTED" },
    })
    expect(JSON.stringify(rejected)).not.toContain("patient 123")
  })
})
