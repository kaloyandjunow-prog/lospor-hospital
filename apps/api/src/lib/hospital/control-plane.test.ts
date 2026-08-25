import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  installation: vi.fn(),
  policy: vi.fn(),
  batches: vi.fn(),
  queues: vi.fn(),
  awaiting: vi.fn(),
  guidance: vi.fn(),
  research: vi.fn(),
  externalAi: vi.fn(),
  baselines: vi.fn(),
  hospital: vi.fn(() => true),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    hospitalInstallation: { findUnique: mocks.installation },
    centralExportPolicy: { findUnique: mocks.policy },
    centralDeliveryBatch: { findMany: mocks.batches, groupBy: mocks.queues },
    clinicalGuidancePolicy: { findUnique: mocks.guidance },
  },
}))
vi.mock("@/lib/hospital/deployment", () => ({ isHospitalDeployment: mocks.hospital }))
vi.mock("@/lib/hospital/config", () => ({
  hospitalConfig: () => ({}),
  isCentralDeliveryConfigured: () => false,
}))
vi.mock("@/lib/hospital/central-status", () => ({
  countCasesAwaitingCentralExport: mocks.awaiting,
}))
vi.mock("@/lib/hospital/enrollment", () => ({ enrollHospital: vi.fn() }))
vi.mock("@/lib/audit", () => ({ logAuditInTransaction: vi.fn() }))
vi.mock("@/lib/pediatric-mode", () => ({
  pediatricCapabilities: () => ({
    enabled: true,
    productionReady: true,
    rulesetVersion: "pediatric-v2",
    minimumClientVersion: "8.0.0",
    reviewedDoseProfilesRequired: true,
  }),
}))
vi.mock("@/lib/hospital/clinical-baseline-readiness", () => ({
  assessHospitalClinicalBaselines: mocks.baselines,
}))
vi.mock("@/lib/hospital/external-ai-policy", () => ({
  configuredExternalAiDefault: () => true,
  externalAiControlView: mocks.externalAi,
  sealExternalAiCredential: vi.fn(),
}))
vi.mock("@/lib/hospital/research-control", () => ({
  approveHospitalOmopExport: vi.fn(),
  issueHospitalResearchGrant: vi.fn(),
  listHospitalResearchControl: mocks.research,
  revokeHospitalResearchGrant: vi.fn(),
  statusGrantRevokeSchema: {},
  statusOmopApprovalSchema: {},
  statusResearchGrantSchema: {},
}))

import { centralControlView, currentGuidancePolicy, hospitalControlPlaneView } from "./control-plane"

describe("privacy-safe Central Status view", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hospital.mockReturnValue(true)
    mocks.installation.mockResolvedValue({
      siteId: "site-1",
      siteCode: "SITE_1",
      institutionId: "inst-1",
      centralBaseUrl: "https://central.example.test/private/enrollment-path",
      centralEnabled: true,
      signingKeyId: "hospital-signing-key-1",
      centralEncryptionKeyId: "central-encryption-key-1",
      receiptSigningKeyId: "central-receipt-key-1",
      supportedManifestVersions: [1],
      maximumUploadBytes: 1024,
      multipartChunkBytes: 256,
      nextSequence: 3,
      lastAcceptedBatchId: "batch-1",
      enrolledAt: new Date("2026-08-20T10:00:00Z"),
      lastCapabilitiesAt: new Date("2026-08-21T10:00:00Z"),
      lastDeliveryAt: new Date("2026-08-22T10:00:00Z"),
      transportConfigurationHash: "a".repeat(64),
      transportConfiguredAt: new Date("2026-08-20T10:00:00Z"),
      transportConfiguredById: "operator-1",
      transportConfigurationReason: "Secret internal transport reason",
    })
    mocks.policy.mockResolvedValue({
      enabled: true,
      includeRedactedText: true,
      redactionProfile: "bg-en-v1",
      approvedAt: new Date("2026-08-20T11:00:00Z"),
    })
    mocks.batches.mockResolvedValue([{
      id: "batch-2",
      sequence: 2,
      status: "RETRY",
      cutoffFrom: null,
      cutoffTo: new Date("2026-08-22T09:00:00Z"),
      manifestHash: "b".repeat(64),
      ciphertextSha256: "c".repeat(64),
      receiptHash: null,
      attemptCount: 2,
      nextAttemptAt: new Date("2026-08-22T12:30:00Z"),
      errorCode: "CENTRAL_UNAVAILABLE",
      createdAt: new Date("2026-08-22T09:05:00Z"),
      generatedAt: new Date("2026-08-22T09:06:00Z"),
      acceptedAt: null,
      _count: { cases: 17 },
    }])
    mocks.queues.mockResolvedValue([{ status: "RETRY", _count: { _all: 1 } }])
    mocks.awaiting.mockResolvedValue(17)
    mocks.guidance.mockResolvedValue({
      adultEnabled: true,
      pediatricEnabled: false,
      updatedAt: new Date("2026-08-22T10:00:00Z"),
    })
    mocks.research.mockResolvedValue({
      policy: { defaultExpiryDays: 90, maximumExpiryDays: 365 },
      accounts: [], institutions: [], grants: [], omopRequests: [],
    })
    mocks.externalAi.mockResolvedValue({
      externalAiEnabled: true,
      provider: "MISTRAL",
      credentialStored: false,
      providerConfigured: false,
      capability: "PROVIDER_NOT_CONFIGURED",
      credentialConfiguredAt: null,
      credentialChangedAt: null,
      policyChangedAt: null,
      updatedAt: null,
    })
    mocks.baselines.mockResolvedValue({
      adult: { mode: "ADULT", baselineReady: true, reasonCode: "READY" },
      pediatric: {
        mode: "PEDIATRIC",
        baselineReady: false,
        reasonCode: "SELECTION_MISSING",
        selected: null,
      },
    })
  })

  it("returns fingerprints/hashes/counts and never configuration secrets or clinical rows", async () => {
    const view = await centralControlView()
    expect(view).toMatchObject({
      disabledByDefault: true,
      pushOnly: true,
      credentialsPresent: false,
      endpoint: "https://central.example.test",
      compatibility: {
        localManifestVersion: "1",
        supportedManifestVersions: ["1"],
        compatible: true,
      },
      centralEncryptionKeyId: "central-encryption-key-1",
      transportLocked: true,
      casesAwaitingExport: 17,
      queuesByStatus: { RETRY: 1 },
      batches: [{ caseCount: 17, manifestHash: "b".repeat(64) }],
    })
    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain("private/enrollment-path")
    expect(serialized).not.toContain("Secret internal transport reason")
    expect(serialized).not.toContain("centralEncryptionPublicKeyPem")
    expect(serialized).not.toContain("receiptSigningPublicKeyPem")
    expect(serialized).not.toContain("patient")
    expect(serialized).not.toContain('"_count"')
  })

  it("does not claim the transport is locked when its actor evidence is incomplete", async () => {
    mocks.installation.mockResolvedValue({
      ...(await mocks.installation()),
      transportConfiguredById: null,
    })

    await expect(centralControlView()).resolves.toMatchObject({ transportLocked: false })
  })

  it("keeps the public/serverless demo on upstream always-on behavior without reading appliance policy", async () => {
    mocks.hospital.mockReturnValue(false)
    await expect(currentGuidancePolicy()).resolves.toMatchObject({
      id: "public-demo",
      adultEnabled: true,
      pediatricEnabled: true,
    })
    expect(mocks.guidance).not.toHaveBeenCalled()
  })

  it("projects policy separately from the shared exact-baseline assessment", async () => {
    const view = await hospitalControlPlaneView()
    expect(view).toMatchObject({
      schemaVersion: 2,
      pediatricMode: {
        enabled: true,
        productionReady: false,
        releaseReviewed: true,
        bundledRulesetVersion: "pediatric-v2",
      },
      guidance: {
        adultEnabled: true,
        pediatricEnabled: false,
        baselines: {
          adult: { baselineReady: true, reasonCode: "READY" },
          pediatric: { baselineReady: false, reasonCode: "SELECTION_MISSING" },
        },
      },
    })
    expect(mocks.baselines).toHaveBeenCalledOnce()
    expect(JSON.stringify(view)).not.toContain("payload")
    expect(JSON.stringify(view)).not.toContain("sourceRefs")
    expect(JSON.stringify(view)).not.toContain("selectedById")
  })
})
