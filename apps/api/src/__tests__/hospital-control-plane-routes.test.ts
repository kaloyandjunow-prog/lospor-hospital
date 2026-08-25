import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  hospital: vi.fn(() => true),
  authorize: vi.fn(async (): Promise<
    | { ok: true }
    | { ok: false; status: 401 | 503; code: "UNAUTHORIZED" | "STATUS_CONTROL_NOT_CONFIGURED" }
  > => ({ ok: true })),
  view: vi.fn(),
  issue: vi.fn(),
  revoke: vi.fn(),
  approveOmop: vi.fn(),
  transport: vi.fn(),
  centralPolicy: vi.fn(),
  retry: vi.fn(),
  guidance: vi.fn(),
  externalAiPolicy: vi.fn(),
  externalAiReplace: vi.fn(),
  externalAiRemove: vi.fn(),
}))

vi.mock("@/lib/hospital/deployment", () => ({ isHospitalDeployment: mocks.hospital }))
vi.mock("@/lib/hospital/status-snapshot-auth", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/hospital/status-snapshot-auth")>(),
  statusOperatorRequestAuthorized: mocks.authorize,
}))
vi.mock("@/lib/hospital/control-plane", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/hospital/control-plane")>(),
  hospitalControlPlaneView: mocks.view,
  issueHospitalResearchGrant: mocks.issue,
  revokeHospitalResearchGrant: mocks.revoke,
  approveHospitalOmopExport: mocks.approveOmop,
  configureCentralTransport: mocks.transport,
  setCentralClinicalPolicy: mocks.centralPolicy,
  retryCentralBatch: mocks.retry,
  setGuidancePolicy: mocks.guidance,
  setExternalAiPolicy: mocks.externalAiPolicy,
  replaceExternalAiCredential: mocks.externalAiReplace,
  removeExternalAiCredential: mocks.externalAiRemove,
}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

function request(path: string, body?: unknown, method?: string) {
  return new Request(`http://api.test${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      authorization: `Bearer ${"s".repeat(32)}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

const grant = {
  userId: "user-1",
  institutionId: "inst-1",
  allInstitutions: false,
  purpose: "Approved protocol 42",
  expiryDays: 90,
  supersedesGrantId: null,
  canQuery: true,
  canInspectCases: false,
  canExportCsv: true,
  canExportJson: false,
  canExportOmop: false,
  canShare: false,
}

describe("private Status Hospital control-plane routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hospital.mockReturnValue(true)
    mocks.authorize.mockResolvedValue({ ok: true })
    mocks.view.mockResolvedValue({
      schemaVersion: 1,
      research: { policy: {}, accounts: [], institutions: [], grants: [], omopRequests: [] },
      central: { disabledByDefault: true, pushOnly: true, endpoint: null, batches: [] },
      guidance: { adultEnabled: true, pediatricEnabled: true, updatedAt: null },
      externalAi: {
        externalAiEnabled: true,
        provider: "MISTRAL",
        credentialStored: false,
        providerConfigured: false,
        capability: "PROVIDER_NOT_CONFIGURED",
        credentialConfiguredAt: null,
        credentialChangedAt: null,
        policyChangedAt: null,
        updatedAt: null,
      },
    })
    mocks.issue.mockResolvedValue({ id: "grant-1", expiresAt: new Date("2026-11-20T12:00:00Z") })
    mocks.revoke.mockResolvedValue({ id: "grant-1" })
    mocks.approveOmop.mockResolvedValue({ id: "approval-1" })
    mocks.transport.mockResolvedValue({ id: "local" })
    mocks.centralPolicy.mockResolvedValue({ enabled: true })
    mocks.retry.mockResolvedValue({ id: "batch-1", status: "RETRY" })
    mocks.guidance.mockResolvedValue({
      adultEnabled: false,
      pediatricEnabled: true,
      updatedAt: new Date("2026-08-22T12:00:00Z"),
    })
    mocks.externalAiPolicy.mockResolvedValue({
      externalAiEnabled: false,
      provider: "MISTRAL",
      policyChangedAt: new Date("2026-08-22T12:00:00Z"),
    })
    mocks.externalAiReplace.mockResolvedValue({
      provider: "MISTRAL",
      credentialConfigured: true,
      credentialConfiguredAt: new Date("2026-08-22T12:00:00Z"),
    })
    mocks.externalAiRemove.mockResolvedValue({
      provider: "MISTRAL",
      credentialConfigured: false,
      credentialConfiguredAt: null,
    })
  })

  it("is unreachable outside Hospital before any control function runs", async () => {
    mocks.hospital.mockReturnValue(false)
    const root = await import("@/app/v1/internal/hospital/control-plane/route")
    const grants = await import("@/app/v1/internal/hospital/control-plane/research/grants/route")
    const aiCredential = await import("@/app/v1/internal/hospital/control-plane/external-ai/credential/route")
    expect((await root.GET(request("/v1/internal/hospital/control-plane"))).status).toBe(404)
    expect((await grants.POST(request("/v1/internal/hospital/control-plane/research/grants", grant))).status).toBe(404)
    expect((await aiCredential.POST(request(
      "/v1/internal/hospital/control-plane/external-ai/credential",
      { credential: "must-not-be-consumed", reason: "Configure approved provider" },
    ))).status).toBe(404)
    expect(mocks.view).not.toHaveBeenCalled()
    expect(mocks.issue).not.toHaveBeenCalled()
    expect(mocks.externalAiReplace).not.toHaveBeenCalled()
  })

  it("returns privacy-safe metadata with no-store caching", async () => {
    const { GET } = await import("@/app/v1/internal/hospital/control-plane/route")
    const response = await GET(request("/v1/internal/hospital/control-plane"))
    const body = await response.json() as Record<string, unknown>
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(body).toHaveProperty("central.pushOnly", true)
    expect(JSON.stringify(body)).not.toContain("privateKey")
    expect(JSON.stringify(body)).not.toContain("certificatePem")
    expect(JSON.stringify(body)).not.toContain("patient")
  })

  it("issues immutable grants and exact OMOP approvals through distinct endpoints", async () => {
    const grants = await import("@/app/v1/internal/hospital/control-plane/research/grants/route")
    const issued = await grants.POST(request("/v1/internal/hospital/control-plane/research/grants", grant))
    expect(issued.status).toBe(201)
    expect(mocks.issue).toHaveBeenCalledWith({}, expect.objectContaining({
      userId: "user-1",
      expiryDays: 90,
      canExportCsv: true,
    }))

    const omop = await import("@/app/v1/internal/hospital/control-plane/research/omop/[id]/approve/route")
    const approved = await omop.POST(
      request("/v1/internal/hospital/control-plane/research/omop/export-1/approve", {
        reason: "Protocol committee approval",
      }),
      { params: Promise.resolve({ id: "export-1" }) },
    )
    expect(approved.status).toBe(201)
    expect(mocks.approveOmop).toHaveBeenCalledWith({}, "export-1", "Protocol committee approval")
  })

  it("never echoes the Central enrollment token and keeps policy a separate mutation", async () => {
    const transport = await import("@/app/v1/internal/hospital/control-plane/central/transport/route")
    const token = "T".repeat(32)
    const enrolled = await transport.POST(request("/v1/internal/hospital/control-plane/central/transport", {
      token,
      centralBaseUrl: "https://central.example.test/enroll",
      siteCode: "SITE_1",
      siteName: "Hospital site",
      institutionId: "inst-1",
      reason: "Initial private transport lock",
    }))
    expect(enrolled.status).toBe(201)
    expect(await enrolled.text()).not.toContain(token)
    expect(mocks.transport).toHaveBeenCalledOnce()
    expect(mocks.centralPolicy).not.toHaveBeenCalled()

    const policy = await import("@/app/v1/internal/hospital/control-plane/central/policy/route")
    const approved = await policy.POST(request("/v1/internal/hospital/control-plane/central/policy", {
      enabled: true,
      includeRedactedText: true,
      redactionProfile: "bg-en-v1",
      reason: "Approved clinical export policy",
    }))
    expect(approved.status).toBe(200)
    expect(mocks.centralPolicy).toHaveBeenCalledOnce()
  })

  it("retires every clinical-session Central mutation that bypassed Status reauthentication", async () => {
    const enrollment = await import("@/app/v1/hospital/enroll/route")
    const policy = await import("@/app/v1/hospital/export-policy/route")
    const deliveries = await import("@/app/v1/hospital/deliveries/route")
    const mutation = request("/v1/hospital/retired", { enabled: true })

    for (const response of [
      await enrollment.POST(mutation.clone()),
      await policy.PUT(mutation.clone()),
      await deliveries.POST(mutation.clone()),
    ]) {
      expect(response.status).toBe(404)
      expect(response.headers.get("cache-control")).toContain("no-store")
      expect(await response.json()).toMatchObject({ code: "NOT_FOUND" })
    }
  })

  it("updates adult and pediatric guidance independently", async () => {
    const { POST } = await import("@/app/v1/internal/hospital/control-plane/guidance/route")
    const response = await POST(request("/v1/internal/hospital/control-plane/guidance", {
      adultEnabled: false,
      pediatricEnabled: true,
      reason: "Disable adult suggestions locally",
    }))
    expect(response.status).toBe(200)
    expect(mocks.guidance).toHaveBeenCalledWith(expect.objectContaining({
      adultEnabled: false,
      pediatricEnabled: true,
    }))
  })

  it("keeps the provider secret out of responses and removes it through a distinct mutation", async () => {
    const credentialRoute = await import(
      "@/app/v1/internal/hospital/control-plane/external-ai/credential/route"
    )
    const credential = "mistral-secret-value"
    const replaced = await credentialRoute.POST(request(
      "/v1/internal/hospital/control-plane/external-ai/credential",
      { credential, reason: "Configure approved Mistral provider" },
    ))
    expect(replaced.status).toBe(200)
    expect(await replaced.text()).not.toContain(credential)
    expect(mocks.externalAiReplace).toHaveBeenCalledWith({
      credential,
      reason: "Configure approved Mistral provider",
    })

    const removed = await credentialRoute.DELETE(request(
      "/v1/internal/hospital/control-plane/external-ai/credential",
      { reason: "Remove the retired provider credential" },
      "DELETE",
    ))
    expect(removed.status).toBe(200)
    expect(mocks.externalAiRemove).toHaveBeenCalledWith({
      reason: "Remove the retired provider credential",
    })
  })

  it("updates external AI policy without touching the stored provider credential", async () => {
    const { POST } = await import(
      "@/app/v1/internal/hospital/control-plane/external-ai/policy/route"
    )
    const response = await POST(request(
      "/v1/internal/hospital/control-plane/external-ai/policy",
      { externalAiEnabled: false, reason: "Disable external AI for local policy" },
    ))
    expect(response.status).toBe(200)
    expect(mocks.externalAiPolicy).toHaveBeenCalledWith({
      externalAiEnabled: false,
      reason: "Disable external AI for local policy",
    })
    expect(mocks.externalAiRemove).not.toHaveBeenCalled()
  })
})
