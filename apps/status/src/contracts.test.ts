import { describe, expect, it } from "vitest"
import { parseSafeOperationalEvent } from "./event-contract.js"
import { parseBackupSignal, parseWorkerSignal } from "./signals.js"
import { parseApplianceSnapshot } from "./snapshot.js"

describe("privacy-safe producer contracts", () => {
  const now = Date.parse("2026-08-12T12:00:00.000Z")

  it("accepts known events and rejects arbitrary PHI/free text", () => {
    expect(parseSafeOperationalEvent({
      eventId: "8cb77871-2875-4332-94e1-728bb7b3871b",
      occurredAt: "2026-08-12T11:59:00.000Z",
      code: "EMAIL_DELIVERY_FAILED",
      facts: { category: "verification", failureKind: "network", httpStatus: 503 },
    }, now)).toMatchObject({ code: "EMAIL_DELIVERY_FAILED", severity: "warning" })
    expect(parseSafeOperationalEvent({
      eventId: "8cb77871-2875-4332-94e1-728bb7b3871b",
      occurredAt: "2026-08-12T11:59:00.000Z",
      code: "EMAIL_DELIVERY_FAILED",
      facts: { category: "verification", failureKind: "network", email: "patient@example.test" },
    }, now)).toBeNull()
    expect(parseSafeOperationalEvent({
      eventId: "4ab7d2b7-570e-4cba-9275-75e5788cdbad",
      occurredAt: "2026-08-12T11:59:00.000Z",
      code: "CLINICAL_WRITE_FAILED",
      facts: { operation: "finalize" },
    }, now)).toMatchObject({ severity: "critical", code: "CLINICAL_WRITE_FAILED" })
    expect(parseSafeOperationalEvent({
      eventId: "9b31809a-2bb9-49cb-a935-aa174c308832",
      occurredAt: "2026-08-12T11:59:00.000Z",
      code: "AI_PROVIDER_REQUEST_FAILED",
      facts: { feature: "advise", failureKind: "configuration" },
    }, now)).not.toBeNull()
    expect(parseSafeOperationalEvent({
      eventId: "540776fe-053b-4201-ab02-790d0b080607",
      occurredAt: "2026-08-12T11:59:00.000Z",
      code: "APPLIANCE_OPERATOR_CHANGED",
      facts: { operation: "reconcile", credentialGeneration: 4 },
    }, now)).not.toBeNull()
    expect(parseSafeOperationalEvent({
      eventId: "8cb77871-2875-4332-94e1-728bb7b3871b",
      occurredAt: "2026-08-12T11:59:00.000Z",
      code: "CENTRAL_DELIVERY_FAILED",
      facts: { stage: "a filename or raw exception" },
    }, now)).toBeNull()
  })

  it("strictly validates both atomic signal files", () => {
    expect(parseBackupSignal({
      schemaVersion: 1,
      signalType: "backup",
      observedAt: "2026-08-12T11:00:00.000Z",
      state: "SUCCESS",
      resultCode: "BACKUP_VERIFIED",
      artifactBytes: 12345,
      checksumAlgorithm: "sha256",
    }, now)).not.toBeNull()
    expect(parseBackupSignal({
      schemaVersion: 1,
      signalType: "backup",
      observedAt: "2026-08-12T11:00:00.000Z",
      state: "SUCCESS",
      resultCode: "BACKUP_VERIFIED",
      artifactBytes: 12345,
      checksumAlgorithm: "sha256",
      filename: "must-not-cross-boundary.dump",
    }, now)).toBeNull()
    expect(parseWorkerSignal({
      schemaVersion: 1,
      signalType: "delivery-worker",
      observedAt: "2026-08-12T11:59:00.000Z",
      state: "FAILURE",
      resultCode: "API_UNAVAILABLE",
      httpStatusCategory: 5,
    }, now)).not.toBeNull()
    expect(parseBackupSignal({
      schemaVersion: 1,
      signalType: "backup",
      observedAt: "2026-08-12T12:05:00.001Z",
      state: "SUCCESS",
      resultCode: "BACKUP_VERIFIED",
      artifactBytes: 12345,
      checksumAlgorithm: "sha256",
    }, now)).toBeNull()
    expect(parseWorkerSignal({
      schemaVersion: 1,
      signalType: "delivery-worker",
      observedAt: "2026-08-12T12:05:00.001Z",
      state: "SUCCESS",
      resultCode: "PROCESS_REQUEST_ACCEPTED",
    }, now)).toBeNull()
  })

  it("accepts only the versioned aggregate appliance snapshot", () => {
    const snapshot = {
      schemaVersion: 1,
      generatedAt: "2026-08-12T11:59:00.000Z",
      versions: { hospital: "1.0.0", api: "9.0.0", core: "9.0.1", databaseSchema: "hospital-1" },
      operatorCredentialGeneration: 2,
      operatorCredentialIdentityProof: "a".repeat(64),
      email: { configured: true },
      database: {
        logicalSize: { state: "known", bytes: "123456" },
        migrations: { state: "ok", appliedCount: 12, failedCount: 0, latestFinishedAt: null },
      },
      research: {
        exportsByStatus: { PENDING: 2, FAILED: 0 },
        storage: { driver: "filesystem", state: "known", totalBytes: "1000", availableBytes: "500" },
      },
      central: {
        configured: false,
        enrolled: false,
        exportPolicyApproved: false,
        casesWithUnacceptedChanges: 0,
        deliveriesByStatus: {},
        enrolledAt: null,
        lastCapabilitiesAt: null,
        lastDeliveryAt: null,
      },
    }
    expect(parseApplianceSnapshot(snapshot)).toEqual(snapshot)
    expect(parseApplianceSnapshot({ ...snapshot, patientId: "must-not-cross-boundary" })).toBeNull()
  })
})
