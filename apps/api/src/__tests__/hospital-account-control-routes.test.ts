import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  hospital: vi.fn(() => true),
  authorize: vi.fn(async (): Promise<
    | { ok: true }
    | { ok: false; status: 401 | 503; code: "UNAUTHORIZED" | "STATUS_CONTROL_NOT_CONFIGURED" }
  > => ({ ok: true })),
  list: vi.fn(),
  create: vi.fn(),
  reissue: vi.fn(),
  recovery: vi.fn(),
}))

vi.mock("@/lib/hospital/deployment", () => ({
  isHospitalDeployment: mocks.hospital,
}))
vi.mock("@/lib/hospital/status-snapshot-auth", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/hospital/status-snapshot-auth")>(),
  statusOperatorRequestAuthorized: mocks.authorize,
}))
vi.mock("@/lib/hospital/account-provisioning", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/hospital/account-provisioning")>(),
  listHospitalAccounts: mocks.list,
  createHospitalAccount: mocks.create,
  reissueHospitalActivation: mocks.reissue,
  issueHospitalRecovery: mocks.recovery,
}))
vi.mock("@/lib/transactional-email", () => ({
  appUrl: (path: string) => `https://clinical.hospital.test${path}`,
}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const INPUT = {
  username: "Dr.Iva",
  email: "doctor@example.test",
  firstName: "Ива",
  lastName: "Петрова",
  title: "д-р",
  institutionId: "inst-1",
  accessProfile: "CLINICAL_MEMBER",
  locale: "bg",
}

function request(path: string, body?: unknown) {
  return new Request(`http://api.test${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${"s".repeat(32)}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

describe("private Status account-control routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hospital.mockReturnValue(true)
    mocks.authorize.mockResolvedValue({ ok: true })
    mocks.list.mockResolvedValue({ accounts: [], institutions: [] })
    mocks.create.mockResolvedValue({
      user: {
        id: "user-1",
        username: INPUT.username,
        email: INPUT.email,
        name: "д-р Ива Петрова",
        role: "MEMBER",
        accountKind: "CLINICAL",
        institutionId: "inst-1",
      },
      institution: { id: "inst-1", name: "УМБАЛ Тест" },
      token: "A".repeat(43),
      expiresAt: new Date("2026-08-25T12:00:00.000Z"),
    })
    mocks.reissue.mockResolvedValue({
      token: "B".repeat(43),
      expiresAt: new Date("2026-08-25T12:00:00.000Z"),
    })
    mocks.recovery.mockResolvedValue({
      token: "C".repeat(43),
      expiresAt: new Date("2026-08-22T20:00:00.000Z"),
    })
  })

  it("fails closed outside Hospital and when the private bearer is refused", async () => {
    const { GET } = await import("@/app/v1/internal/hospital/accounts/route")
    mocks.hospital.mockReturnValue(false)
    expect((await GET(request("/v1/internal/hospital/accounts"))).status).toBe(404)

    mocks.hospital.mockReturnValue(true)
    mocks.authorize.mockResolvedValue({ ok: false, status: 401, code: "UNAUTHORIZED" })
    expect((await GET(request("/v1/internal/hospital/accounts"))).status).toBe(401)
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it("returns only safe account metadata with no-store caching", async () => {
    mocks.list.mockResolvedValue({
      accounts: [{ id: "user-1", email: INPUT.email }],
      institutions: [{ id: "inst-1", name: "УМБАЛ Тест" }],
    })
    const { GET } = await import("@/app/v1/internal/hospital/accounts/route")
    const response = await GET(request("/v1/internal/hospital/accounts"))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(await response.json()).toEqual({
      accounts: [{ id: "user-1", email: INPUT.email }],
      institutions: [{ id: "inst-1", name: "УМБАЛ Тест" }],
    })
  })

  it("creates an account and places its one-time secret only in a URL fragment", async () => {
    const { POST } = await import("@/app/v1/internal/hospital/accounts/route")
    const response = await POST(request("/v1/internal/hospital/accounts", INPUT))
    expect(response.status).toBe(201)
    const body = await response.json() as { oneTimeLink: { url: string; purpose: string } }
    const url = new URL(body.oneTimeLink.url)
    expect(url.pathname).toBe("/reset-password")
    expect(url.search).toBe("")
    expect(url.hash).toBe(`#hospitalToken=${"A".repeat(43)}`)
    expect(body.oneTimeLink.purpose).toBe("ACTIVATION")
    expect(response.headers.get("cache-control")).toContain("no-store")
  })

  it("rejects malformed create bodies before provisioning", async () => {
    const { POST } = await import("@/app/v1/internal/hospital/accounts/route")
    const response = await POST(request("/v1/internal/hospital/accounts", {
      ...INPUT,
      accessProfile: "ADMIN",
    }))
    expect(response.status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("returns one-time reissue and recovery links without exposing a token field", async () => {
    const activationRoute = await import("@/app/v1/internal/hospital/accounts/[id]/activation/route")
    const activation = await activationRoute.POST(
      request("/v1/internal/hospital/accounts/user-1/activation", {}),
      { params: Promise.resolve({ id: "user-1" }) },
    )
    const activationBody = await activation.json() as Record<string, unknown>
    expect(JSON.stringify(activationBody)).toContain(`#hospitalToken=${"B".repeat(43)}`)
    expect(activationBody).not.toHaveProperty("token")

    const recoveryRoute = await import("@/app/v1/internal/hospital/accounts/[id]/recovery/route")
    const recovery = await recoveryRoute.POST(
      request("/v1/internal/hospital/accounts/user-1/recovery", {}),
      { params: Promise.resolve({ id: "user-1" }) },
    )
    const recoveryBody = await recovery.json() as Record<string, unknown>
    expect(JSON.stringify(recoveryBody)).toContain(`#hospitalToken=${"C".repeat(43)}`)
    expect(recoveryBody).not.toHaveProperty("token")
  })

  it("returns a stable conflict when Status targets protected authority", async () => {
    const { HospitalAccountError } = await import("@/lib/hospital/account-provisioning")
    mocks.recovery.mockRejectedValue(new HospitalAccountError("ACCOUNT_AUTHORITY_PROTECTED"))
    const recoveryRoute = await import("@/app/v1/internal/hospital/accounts/[id]/recovery/route")
    const response = await recoveryRoute.POST(
      request("/v1/internal/hospital/accounts/admin-1/recovery", {}),
      { params: Promise.resolve({ id: "admin-1" }) },
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: "ACCOUNT_AUTHORITY_PROTECTED",
      code: "ACCOUNT_AUTHORITY_PROTECTED",
    })
  })
})
