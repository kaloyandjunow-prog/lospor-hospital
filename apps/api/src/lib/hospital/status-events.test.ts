import { describe, expect, it } from "vitest"
import { makeSafeStatusEvent } from "./status-events"

describe("safe status events", () => {
  it("creates the fixed, versionable producer contract", () => {
    const event = makeSafeStatusEvent("AI_PROVIDER_REQUEST_FAILED", {
      feature: "read-labs",
      failureKind: "timeout",
    })
    expect(event).toMatchObject({
      code: "AI_PROVIDER_REQUEST_FAILED",
      facts: { feature: "read-labs", failureKind: "timeout" },
    })
    expect(event?.eventId).toMatch(/^[0-9a-f-]{36}$/)
    expect(Number.isNaN(Date.parse(event?.occurredAt ?? ""))).toBe(false)
  })

  it("rejects arbitrary fields before anything leaves the API", () => {
    expect(makeSafeStatusEvent("AUDIT_WRITE_FAILED", {
      patientId: "must-not-leave",
    } as never)).toBeNull()
    expect(makeSafeStatusEvent("CENTRAL_DELIVERY_FAILED", {
      stage: "upload",
      error: "raw provider body",
    } as never)).toBeNull()
  })

  it("rejects free-text enum values", () => {
    expect(makeSafeStatusEvent("RESEARCH_EXPORT_WORKER_FAILED", {
      stage: "a filename or exception",
    } as never)).toBeNull()
  })

  it.each(["advise", "case-advise", "read-labs", "vitals-scan"] as const)(
    "allows fixed AI failure facts for %s",
    feature => {
      expect(makeSafeStatusEvent("AI_PROVIDER_REQUEST_FAILED", {
        feature,
        failureKind: "provider",
        httpStatus: 503,
      })).not.toBeNull()
    },
  )

  it("rejects invalid HTTP status and arbitrary AI facts", () => {
    expect(makeSafeStatusEvent("AI_PROVIDER_REQUEST_FAILED", {
      feature: "advise",
      failureKind: "provider",
      httpStatus: 42,
    })).toBeNull()
    expect(makeSafeStatusEvent("AI_PROVIDER_REQUEST_FAILED", {
      feature: "advise",
      failureKind: "network",
      providerBody: "must-not-leave",
    } as never)).toBeNull()
  })
})
