import { describe, expect, it, vi } from "vitest"
import { ControlPlaneClient } from "./control-plane.js"

const HASH = "a".repeat(64)
const ADULT_BASELINE_HASH = "f".repeat(64)
const PEDIATRIC_BASELINE_HASH = "9".repeat(64)
const VIEW = {
  schemaVersion: 4,
  pediatricMode: {
    enabled: true,
    productionReady: false,
    releaseReviewed: true,
    rulesetVersion: "pediatric-v2",
    bundledRulesetVersion: "pediatric-v2",
    minimumClientVersion: "8.0.0",
    reviewedDoseProfilesRequired: true,
  },
  research: {
    policy: { defaultExpiryDays: 90, maximumExpiryDays: 365 },
    accounts: [{
      id: "user-1",
      email: "doctor@example.test",
      name: "Doctor Test",
      institutionId: "inst-1",
      accountKind: "CLINICAL",
      role: "MEMBER",
    }],
    institutions: [{ id: "inst-1", name: "Hospital Test" }],
    grants: [],
    omopRequests: [],
  },
  central: {
    disabledByDefault: true,
    pushOnly: true,
    credentialsPresent: true,
    endpoint: "https://central.example.test",
    siteId: "site-1",
    siteCode: "SITE_1",
    institutionId: "inst-1",
    transportLocked: true,
    transportConfigurationHash: HASH,
    transportConfiguredAt: "2026-08-22T10:00:00.000Z",
    clientCertificate: {
      fingerprintSha256: "b".repeat(64),
      validFrom: "2026-08-01T00:00:00.000Z",
      validTo: "2027-08-01T00:00:00.000Z",
    },
    caCertificate: {
      fingerprintSha256: "c".repeat(64),
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: "2036-01-01T00:00:00.000Z",
    },
    signingKeyId: "hospital-key-1",
    centralEncryptionKeyId: "central-encryption-key-1",
    receiptSigningKeyId: "central-key-1",
    compatibility: {
      localManifestVersion: "1",
      supportedManifestVersions: ["1"],
      compatible: true,
      maximumUploadBytes: 1024,
      multipartChunkBytes: 256,
    },
    enrolled: true,
    enrolledAt: "2026-08-22T10:00:00.000Z",
    lastCapabilitiesAt: "2026-08-22T10:01:00.000Z",
    lastDeliveryAt: null,
    nextSequence: 2,
    lastAcceptedBatchId: null,
    policy: null,
    casesAwaitingExport: 0,
    queuesByStatus: { RETRY: 1 },
    batches: [{
      id: "batch-1",
      sequence: 1,
      status: "RETRY",
      cutoffFrom: null,
      cutoffTo: "2026-08-22T11:00:00.000Z",
      manifestHash: "d".repeat(64),
      ciphertextSha256: "e".repeat(64),
      receiptHash: null,
      attemptCount: 1,
      nextAttemptAt: "2026-08-22T12:00:00.000Z",
      errorCode: "CENTRAL_UNAVAILABLE",
      createdAt: "2026-08-22T11:01:00.000Z",
      generatedAt: "2026-08-22T11:02:00.000Z",
      acceptedAt: null,
      caseCount: 3,
    }],
  },
  guidance: {
    adultEnabled: true,
    pediatricEnabled: false,
    updatedAt: "2026-08-22T09:00:00.000Z",
    baselines: {
      adult: {
        mode: "ADULT",
        baselineReady: true,
        reasonCode: "READY",
        expected: {
          presetId: "lospor-adults-v2",
          key: "LOSPOR_ADULTS",
          version: 2,
          digestSha256: ADULT_BASELINE_HASH,
          ruleCount: 3,
          profileCounts: { drug: 1, infusion: 1, fluid: 1, total: 3 },
        },
        selected: {
          presetId: "lospor-adults-v2",
          key: "LOSPOR_ADULTS",
          version: 2,
          status: "PUBLISHED",
          digestSha256: ADULT_BASELINE_HASH,
          ruleCount: 3,
          profileCounts: { drug: 1, infusion: 1, fluid: 1, total: 3 },
        },
      },
      pediatric: {
        mode: "PEDIATRIC",
        baselineReady: false,
        reasonCode: "SELECTION_MISSING",
        expected: {
          presetId: "lospor-pediatrics-v2",
          key: "LOSPOR_PEDIATRICS",
          version: 2,
          digestSha256: PEDIATRIC_BASELINE_HASH,
          ruleCount: 4,
          profileCounts: { drug: 2, infusion: 1, fluid: 1, total: 4 },
        },
        selected: null,
      },
    },
  },
  externalAi: {
    externalAiEnabled: true,
    provider: "MISTRAL",
    credentialStored: true,
    providerConfigured: true,
    capability: "ENABLED",
    credentialConfiguredAt: "2026-08-22T08:00:00.000Z",
    credentialChangedAt: "2026-08-22T08:00:00.000Z",
    policyChangedAt: null,
    updatedAt: "2026-08-22T08:00:00.000Z",
  },
  patientIdentifier: {
    egnPermitted: true,
    changeReasonRecorded: false,
    changedAt: null,
    updatedAt: null,
  },
  ehrTransport: {
    transport: "FOLDER",
    policyEnabled: true,
    credentialStored: false,
    providerConfigured: true,
    capability: "ENABLED",
    credentialConfiguredAt: null,
    credentialChangedAt: null,
    transportChangedAt: null,
    updatedAt: null,
  },
} as const

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("Status control-plane client", () => {
  it("accepts the complete privacy-safe bilingual Status view", async () => {
    const fetcher = vi.fn(async () => json(VIEW)) as unknown as typeof fetch
    const client = new ControlPlaneClient(
      "http://api:3002/v1/internal/hospital/control-plane/",
      "s".repeat(32),
      1_000,
      fetcher,
    )

    await expect(client.get()).resolves.toMatchObject({
      pediatricMode: { enabled: true, productionReady: false, releaseReviewed: true },
      central: {
        endpoint: "https://central.example.test",
        clientCertificate: { fingerprintSha256: "b".repeat(64) },
        caCertificate: { fingerprintSha256: "c".repeat(64) },
      },
      guidance: { adultEnabled: true, pediatricEnabled: false },
      externalAi: { provider: "MISTRAL", providerConfigured: true, capability: "ENABLED" },
      patientIdentifier: { egnPermitted: true, changeReasonRecorded: false },
      ehrTransport: { transport: "FOLDER", providerConfigured: true, capability: "ENABLED" },
    })
    expect(fetcher).toHaveBeenCalledWith(
      "http://api:3002/v1/internal/hospital/control-plane",
      expect.objectContaining({
        headers: { authorization: `Bearer ${"s".repeat(32)}` },
      }),
    )
  })

  it("fails closed on malformed fingerprints, dates, counts, or compatibility facts", async () => {
    const invalid = {
      ...VIEW,
      central: {
        ...VIEW.central,
        clientCertificate: { ...VIEW.central.clientCertificate, fingerprintSha256: "not-a-hash" },
      },
    }
    const client = new ControlPlaneClient(
      "http://api:3002/v1/internal/hospital/control-plane",
      "s".repeat(32),
      1_000,
      vi.fn(async () => json(invalid)) as unknown as typeof fetch,
    )
    await expect(client.get()).rejects.toMatchObject({
      code: "CONTROL_INVALID_RESPONSE",
    })
  })

  it("fails closed when the pediatric charting capability is missing or malformed", async () => {
    const invalid = {
      ...VIEW,
      pediatricMode: { ...VIEW.pediatricMode, enabled: "true" },
    }
    const client = new ControlPlaneClient(
      "http://api:3002/v1/internal/hospital/control-plane",
      "s".repeat(32),
      1_000,
      vi.fn(async () => json(invalid)) as unknown as typeof fetch,
    )
    await expect(client.get()).rejects.toMatchObject({ code: "CONTROL_INVALID_RESPONSE" })
  })

  it("fails closed when a baseline is missing or contradicts the legacy readiness flag", async () => {
    const missing = {
      ...VIEW,
      guidance: { ...VIEW.guidance, baselines: { adult: VIEW.guidance.baselines.adult } },
    }
    const missingClient = new ControlPlaneClient(
      "http://api:3002/v1/internal/hospital/control-plane/",
      "s".repeat(32),
      1_000,
      vi.fn(async () => json(missing)) as unknown as typeof fetch,
    )
    await expect(missingClient.get()).rejects.toMatchObject({ code: "CONTROL_INVALID_RESPONSE" })

    const contradiction = {
      ...VIEW,
      pediatricMode: { ...VIEW.pediatricMode, productionReady: true },
    }
    const contradictionClient = new ControlPlaneClient(
      "http://api:3002/v1/internal/hospital/control-plane/",
      "s".repeat(32),
      1_000,
      vi.fn(async () => json(contradiction)) as unknown as typeof fetch,
    )
    await expect(contradictionClient.get()).rejects.toMatchObject({
      code: "CONTROL_INVALID_RESPONSE",
    })
  })

  it("accepts equivalent ready profile counts regardless of JSON property order", async () => {
    const reorderedCounts = {
      total: 3,
      fluid: 1,
      infusion: 1,
      drug: 1,
    }
    const equivalent = {
      ...VIEW,
      guidance: {
        ...VIEW.guidance,
        baselines: {
          ...VIEW.guidance.baselines,
          adult: {
            ...VIEW.guidance.baselines.adult,
            selected: {
              ...VIEW.guidance.baselines.adult.selected,
              profileCounts: reorderedCounts,
            },
          },
        },
      },
    }
    const client = new ControlPlaneClient(
      "http://api:3002/v1/internal/hospital/control-plane/",
      "s".repeat(32),
      1_000,
      vi.fn(async () => json(equivalent)) as unknown as typeof fetch,
    )

    await expect(client.get()).resolves.toMatchObject({
      guidance: {
        baselines: {
          adult: { baselineReady: true, selected: { profileCounts: reorderedCounts } },
        },
      },
    })
  })

  it("keeps an enrollment token in the bounded POST body, never the URL", async () => {
    const fetcher = vi.fn(async () => json({})) as unknown as typeof fetch
    const client = new ControlPlaneClient(
      "http://api:3002/v1/internal/hospital/control-plane",
      "s".repeat(32),
      1_000,
      fetcher,
    )
    const token = "T".repeat(32)
    await client.configureCentral({
      token,
      centralBaseUrl: "https://central.example.test",
      siteCode: "SITE_1",
      siteName: "Hospital Test",
      institutionId: "inst-1",
      reason: "Initial transport configuration",
    })

    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe("http://api:3002/v1/internal/hospital/control-plane/central/transport")
    expect(String(url)).not.toContain(token)
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ token })
  })

  it("keeps provider credentials in a bounded body and uses DELETE to remove them", async () => {
    const fetcher = vi.fn(async () => json({})) as unknown as typeof fetch
    const client = new ControlPlaneClient(
      "http://api:3002/v1/internal/hospital/control-plane",
      "s".repeat(32),
      1_000,
      fetcher,
    )
    const credential = "mistral-secret-value"
    await client.replaceExternalAiCredential({
      credential,
      reason: "Configure the approved provider",
    })
    await client.removeExternalAiCredential("Remove the provider credential")

    const [replaceUrl, replaceInit] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(replaceUrl).toBe("http://api:3002/v1/internal/hospital/control-plane/external-ai/credential")
    expect(String(replaceUrl)).not.toContain(credential)
    expect(JSON.parse(String((replaceInit as RequestInit).body))).toMatchObject({ credential })
    const [, removeInit] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[1]
    expect((removeInit as RequestInit).method).toBe("DELETE")
    expect(String((removeInit as RequestInit).body)).not.toContain(credential)
  })

  it("fails closed when the national-identifier policy section is missing or malformed", async () => {
    const withoutSection: Record<string, unknown> = { ...VIEW }
    delete withoutSection.patientIdentifier
    const missingClient = new ControlPlaneClient(
      "http://api:3002/v1/internal/hospital/control-plane",
      "s".repeat(32),
      1_000,
      vi.fn(async () => json(withoutSection)) as unknown as typeof fetch,
    )
    await expect(missingClient.get()).rejects.toMatchObject({ code: "CONTROL_INVALID_RESPONSE" })

    const malformed = {
      ...VIEW,
      patientIdentifier: { ...VIEW.patientIdentifier, egnPermitted: "true" },
    }
    const malformedClient = new ControlPlaneClient(
      "http://api:3002/v1/internal/hospital/control-plane",
      "s".repeat(32),
      1_000,
      vi.fn(async () => json(malformed)) as unknown as typeof fetch,
    )
    await expect(malformedClient.get()).rejects.toMatchObject({ code: "CONTROL_INVALID_RESPONSE" })
  })

  it("sends the national-identifier policy input as its own bounded mutation", async () => {
    const fetcher = vi.fn(async () => json({})) as unknown as typeof fetch
    const client = new ControlPlaneClient(
      "http://api:3002/v1/internal/hospital/control-plane",
      "s".repeat(32),
      1_000,
      fetcher,
    )
    await client.setPatientIdentifierPolicy({
      egnPermitted: false,
      reason: "Site will not hold national identifiers",
    })

    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe("http://api:3002/v1/internal/hospital/control-plane/patient-identifier")
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      egnPermitted: false,
      reason: "Site will not hold national identifiers",
    })
  })

  it("fails closed when the EHR transport section is missing or malformed", async () => {
    const withoutSection: Record<string, unknown> = { ...VIEW }
    delete withoutSection.ehrTransport
    const missingClient = new ControlPlaneClient(
      "http://api:3002/v1/internal/hospital/control-plane",
      "s".repeat(32),
      1_000,
      vi.fn(async () => json(withoutSection)) as unknown as typeof fetch,
    )
    await expect(missingClient.get()).rejects.toMatchObject({ code: "CONTROL_INVALID_RESPONSE" })

    const malformed = {
      ...VIEW,
      ehrTransport: { ...VIEW.ehrTransport, transport: "SOMETHING-ELSE" },
    }
    const malformedClient = new ControlPlaneClient(
      "http://api:3002/v1/internal/hospital/control-plane",
      "s".repeat(32),
      1_000,
      vi.fn(async () => json(malformed)) as unknown as typeof fetch,
    )
    await expect(malformedClient.get()).rejects.toMatchObject({ code: "CONTROL_INVALID_RESPONSE" })
  })

  it("sends EHR transport policy and credential inputs as their own bounded mutations", async () => {
    const fetcher = vi.fn(async () => json({})) as unknown as typeof fetch
    const client = new ControlPlaneClient(
      "http://api:3002/v1/internal/hospital/control-plane",
      "s".repeat(32),
      1_000,
      fetcher,
    )
    await client.setEhrTransportPolicy({ transport: null, reason: "No hospital system is ready yet" })
    const [policyUrl, policyInit] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(policyUrl).toBe("http://api:3002/v1/internal/hospital/control-plane/ehr-transport/policy")
    expect(JSON.parse(String((policyInit as RequestInit).body))).toEqual({
      transport: null,
      reason: "No hospital system is ready yet",
    })

    const credential = "fhir-endpoint-secret"
    await client.replaceEhrTransportCredential({
      credential,
      reason: "Configure the approved FHIR endpoint",
    })
    await client.removeEhrTransportCredential("Remove the retired endpoint credential")
    const [replaceUrl, replaceInit] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[1]
    expect(replaceUrl).toBe("http://api:3002/v1/internal/hospital/control-plane/ehr-transport/credential")
    expect(String(replaceUrl)).not.toContain(credential)
    expect(JSON.parse(String((replaceInit as RequestInit).body))).toMatchObject({ credential })
    const [, removeInit] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[2]
    expect((removeInit as RequestInit).method).toBe("DELETE")
    expect(String((removeInit as RequestInit).body)).not.toContain(credential)
  })

  it("refuses all calls when the private URL or bearer is absent", async () => {
    const client = new ControlPlaneClient(null, null, 1_000, vi.fn() as unknown as typeof fetch)
    await expect(client.get()).rejects.toMatchObject({
      code: "CONTROL_NOT_CONFIGURED",
    })
  })
})
