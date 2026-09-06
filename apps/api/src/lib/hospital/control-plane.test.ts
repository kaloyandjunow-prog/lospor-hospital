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
  patientIdentifier: vi.fn(),
  ehrTransport: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    hospitalInstallation: { findUnique: mocks.installation },
    centralExportPolicy: { findUnique: mocks.policy },
    centralDeliveryBatch: { findMany: mocks.batches, groupBy: mocks.queues },
    clinicalGuidancePolicy: { findUnique: mocks.guidance },
    // A site with nothing mapped yet, which is what every site is on its first
    // day. The view has to hold up with all three lists empty.
    hospitalEhrLabCodeMap: { findMany: async () => [] },
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
vi.mock("@/lib/hospital/patient-identifier-policy", () => ({
  patientIdentifierControlView: mocks.patientIdentifier,
}))
vi.mock("@/lib/hospital/ehr-transport-policy", () => ({
  ehrTransportControlView: mocks.ehrTransport,
  sealEhrTransportCredential: vi.fn(),
}))

import {
  centralControlView,
  currentGuidancePolicy,
  authenticationMaterialChanged,
  ehrTransportEndpointSchema,
  hospitalControlPlaneView,
} from "./control-plane"

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
    mocks.patientIdentifier.mockResolvedValue({
      egnPermitted: true,
      changeReasonRecorded: false,
      changedAt: null,
      updatedAt: null,
    })
    mocks.ehrTransport.mockResolvedValue({
      transport: "FOLDER",
      policyEnabled: true,
      credentialStored: false,
      providerConfigured: true,
      capability: "ENABLED",
      credentialConfiguredAt: null,
      credentialChangedAt: null,
      transportChangedAt: null,
      updatedAt: null,
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
      schemaVersion: 4,
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
      patientIdentifier: {
        egnPermitted: true,
        changeReasonRecorded: false,
      },
      ehrTransport: {
        transport: "FOLDER",
        policyEnabled: true,
        credentialStored: false,
        providerConfigured: true,
        capability: "ENABLED",
      },
    })
    expect(mocks.baselines).toHaveBeenCalledOnce()
    expect(mocks.patientIdentifier).toHaveBeenCalledOnce()
    expect(mocks.ehrTransport).toHaveBeenCalledOnce()
    expect(JSON.stringify(view)).not.toContain("payload")
    expect(JSON.stringify(view)).not.toContain("sourceRefs")
    expect(JSON.stringify(view)).not.toContain("selectedById")
  })
})

/**
 * Where the appliance may be told to send clinical data.
 *
 * `z.string().url()` was doing none of this. It accepts http://, ftp://,
 * file:///etc/passwd and http://user:password@host alike -- so the two fields
 * carrying the hospital's FHIR base and its OAuth token URL were validated in
 * name only. The token URL is the sharper of the two: the client secret is
 * POSTed to it, so a plaintext address puts the hospital's own integration
 * password in the clear on every token request, forever.
 *
 * The same guard has protected the Central endpoint since Central existed. It
 * was simply never pointed at these fields.
 */
describe("where an EHR transport may be pointed", () => {
  const base = {
    authMode: "STATIC_BEARER" as const,
    tokenUrl: null,
    clientId: null,
    scope: null,
    reason: "Configuring the hospital integration endpoint",
  }

  beforeEach(() => {
    delete process.env.HOSPITAL_EHR_ALLOW_INSECURE_ENDPOINT
  })

  it("accepts an https endpoint with its path", () => {
    const parsed = ehrTransportEndpointSchema.parse({
      ...base, endpoint: "https://fhir.hospital.example/fhir/r4",
    })
    // The path is kept, unlike Central's origin-only rule: a FHIR base has one,
    // and reducing it would break every real server.
    expect(parsed.endpoint).toContain("/fhir/r4")
  })

  it("refuses a plaintext endpoint", () => {
    expect(() => ehrTransportEndpointSchema.parse({
      ...base, endpoint: "http://fhir.hospital.example/r4",
    })).toThrow()
  })

  // The one that matters most: this is the field the client secret is sent to.
  it("refuses a plaintext token URL", () => {
    expect(() => ehrTransportEndpointSchema.parse({
      ...base,
      endpoint: "https://fhir.hospital.example/r4",
      authMode: "OAUTH2_CLIENT_CREDENTIALS",
      tokenUrl: "http://auth.hospital.example/token",
    })).toThrow()
  })

  // Credentials in a URL end up in logs, proxy access lines, and anything that
  // echoes the configured endpoint back to an operator.
  it("refuses credentials embedded in the address", () => {
    expect(() => ehrTransportEndpointSchema.parse({
      ...base, endpoint: "https://user:password@fhir.hospital.example/r4",
    })).toThrow()
  })

  it("refuses a scheme that is not http or https", () => {
    for (const endpoint of [
      "file:///etc/passwd", "ftp://fhir.hospital.example/r4",
    ]) {
      expect(() => ehrTransportEndpointSchema.parse({ ...base, endpoint })).toThrow()
    }
  })

  /**
   * The deliberate exception. Some hospital integration servers really are
   * http-only inside the LAN, and an appliance that cannot talk to them is an
   * appliance that does not get installed.
   */
  it("permits plaintext to a private address once the deployment allows it", () => {
    process.env.HOSPITAL_EHR_ALLOW_INSECURE_ENDPOINT = "true"
    const parsed = ehrTransportEndpointSchema.parse({
      ...base, endpoint: "http://10.4.1.20/fhir",
    })
    expect(parsed.endpoint).toContain("10.4.1.20")
  })

  // Even with the exception on. A mistyped endpoint must not put a patient's
  // record on the open internet in the clear, and nothing a hospital runs
  // lives at a public address reached over plaintext.
  it("still refuses plaintext to a public address", () => {
    process.env.HOSPITAL_EHR_ALLOW_INSECURE_ENDPOINT = "true"
    expect(() => ehrTransportEndpointSchema.parse({
      ...base, endpoint: "http://fhir.example.com/r4",
    })).toThrow()
  })

  // Link-local is where cloud metadata services live. Excluded rather than
  // included: nothing a hospital runs is there.
  it("does not treat link-local as private", () => {
    process.env.HOSPITAL_EHR_ALLOW_INSECURE_ENDPOINT = "true"
    expect(() => ehrTransportEndpointSchema.parse({
      ...base, endpoint: "http://169.254.169.254/latest/meta-data/",
    })).toThrow()
  })
})

/**
 * The insecure-endpoint exception is the one place plaintext is permitted, and
 * it is permitted only to a hospital's own network. The private-address test
 * was a string prefix: `startsWith("fd")` also matched `fd-example.com`, so two
 * letters at the front of an ordinary public DNS name were enough to carry the
 * hospital's integration password to the open internet in clear text.
 */
describe("what counts as a private address", () => {
  const base = {
    authMode: "STATIC_BEARER" as const,
    tokenUrl: null, clientId: null, scope: null,
    reason: "Configuring the hospital integration endpoint",
  }
  const accepts = (endpoint: string) => {
    process.env.HOSPITAL_EHR_ALLOW_INSECURE_ENDPOINT = "true"
    try {
      ehrTransportEndpointSchema.parse({ ...base, endpoint })
      return true
    } catch {
      return false
    } finally {
      delete process.env.HOSPITAL_EHR_ALLOW_INSECURE_ENDPOINT
    }
  }

  it("accepts a real IPv6 unique-local address", () => {
    expect(accepts("http://[fd00::1]/fhir")).toBe(true)
    expect(accepts("http://[fdab:1234::5]/fhir")).toBe(true)
  })

  // The bug: a public name that merely begins with the same two letters.
  it("refuses a public name that starts fd or fc", () => {
    expect(accepts("http://fd-example.com/fhir")).toBe(false)
    expect(accepts("http://fcbayern.de/fhir")).toBe(false)
  })

  it("still accepts the private IPv4 ranges and loopback", () => {
    expect(accepts("http://10.4.1.20/fhir")).toBe(true)
    expect(accepts("http://192.168.1.5/fhir")).toBe(true)
    expect(accepts("http://[::1]/fhir")).toBe(true)
  })

  // fe80::/10 is link-local, not unique-local, and is where cloud metadata
  // services live.
  it("does not treat link-local as private", () => {
    expect(accepts("http://[fe80::1]/fhir")).toBe(false)
  })
})

/**
 * A stored secret belongs to the whole authentication arrangement, not to the
 * endpoint alone.
 *
 * Only an endpoint change used to clear it, so switching STATIC_BEARER to
 * OAUTH2_CLIENT_CREDENTIALS kept the bearer token and then sent it as a client
 * secret; changing the token URL presented the existing secret to a different
 * authorisation server.
 */
describe("what invalidates a stored transport credential", () => {
  const stored = {
    endpoint: "https://fhir.hospital.example/r4",
    authMode: "STATIC_BEARER",
    tokenUrl: null as string | null,
    clientId: null as string | null,
    scope: null as string | null,
  }
  const next = (change: Partial<typeof stored>) => ({ ...stored, ...change })

  it("clears on any part of the arrangement moving", () => {
    expect(authenticationMaterialChanged(stored, next({ endpoint: "https://other.example/r4" }))).toBe(true)
    expect(authenticationMaterialChanged(stored, next({ authMode: "OAUTH2_CLIENT_CREDENTIALS" }))).toBe(true)
    expect(authenticationMaterialChanged(stored, next({ tokenUrl: "https://auth.example/token" }))).toBe(true)
    expect(authenticationMaterialChanged(stored, next({ clientId: "lospor" }))).toBe(true)
    expect(authenticationMaterialChanged(stored, next({ scope: "system/*.read" }))).toBe(true)
  })

  // Re-saving identical settings must not cost the secret: an operator
  // correcting a typo in the reason should not have to re-enter it.
  it("keeps it when nothing material changed", () => {
    expect(authenticationMaterialChanged(stored, next({}))).toBe(false)
  })

  // No stored policy at all is a change from nothing, and there is no secret
  // to lose.
  it("treats a first configuration as changed", () => {
    expect(authenticationMaterialChanged(null, next({}))).toBe(true)
  })
})
