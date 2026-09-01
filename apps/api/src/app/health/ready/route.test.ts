import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

const { query, activeLegalManifest, administratorMfaKeyIsReady, checkKeyIdentity } = vi.hoisted(() => ({
  query: vi.fn(),
  activeLegalManifest: vi.fn(),
  administratorMfaKeyIsReady: vi.fn(),
  checkKeyIdentity: vi.fn(),
}))

// The key-identity check the route now performs is server-only, as anything
// reading the patient keys should be.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: query } }))
vi.mock("@/lib/legal-documents", () => ({
  activeLegalManifest,
  LegalConfigurationError: class LegalConfigurationError extends Error {},
}))
vi.mock("@/lib/administrator-mfa", () => ({ administratorMfaKeyIsReady }))
// The key check has its own tests; these are about what readiness does with its
// answer.
vi.mock("@/lib/hospital/key-identity", async () => ({
  checkKeyIdentity,
  keyIdentityMessage: (await vi.importActual<typeof import("@/lib/hospital/key-identity")>(
    "@/lib/hospital/key-identity",
  )).keyIdentityMessage,
}))

import { LegalConfigurationError } from "@/lib/legal-documents"
import { GET } from "./route"

describe("GET /health/ready", () => {
  const originalMfaRequired = process.env.LOSPOR_ADMIN_MFA_REQUIRED
  const originalDeploymentMode = process.env.LOSPOR_DEPLOYMENT_MODE

  beforeEach(() => {
    vi.clearAllMocks()
    checkKeyIdentity.mockResolvedValue({ status: "ok" })
    query.mockResolvedValue([{ ok: 1 }])
    activeLegalManifest.mockReturnValue({ deployment: "public-demo-2026-09" })
    administratorMfaKeyIsReady.mockReturnValue(true)
    delete process.env.LOSPOR_ADMIN_MFA_REQUIRED
    delete process.env.LOSPOR_DEPLOYMENT_MODE
  })

  it("reports the active legal deployment when the service is ready", async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      database: "ok",
      legalDocuments: "configured",
      legalDeployment: "public-demo-2026-09",
      administratorMfa: "not-required",
    })
  })

  it("fails closed when a deployment requires administrator MFA without a usable key", async () => {
    process.env.LOSPOR_ADMIN_MFA_REQUIRED = "true"
    administratorMfaKeyIsReady.mockReturnValue(false)
    const response = await GET()
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      database: "ok",
      legalDocuments: "configured",
      administratorMfa: "unavailable",
    })
  })

  it("fails readiness when exact bilingual legal documents are unavailable", async () => {
    activeLegalManifest.mockImplementation(() => {
      throw new LegalConfigurationError("missing")
    })
    const response = await GET()
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      database: "ok",
      legalDocuments: "unavailable",
    })
  })

  it("never checks legal documents for a Hospital deployment, which has no self-registration flow", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    activeLegalManifest.mockImplementation(() => {
      throw new LegalConfigurationError("missing")
    })
    const response = await GET()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      database: "ok",
      legalDocuments: "not-required",
      administratorMfa: "not-required",
    })
    expect(activeLegalManifest).not.toHaveBeenCalled()
  })

  it("does not claim legal validation after a database failure", async () => {
    query.mockRejectedValue(new Error("database down"))
    const response = await GET()
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      database: "error",
      legalDocuments: "unchecked",
    })
    expect(activeLegalManifest).not.toHaveBeenCalled()
  })


  it("refuses readiness when the database was built under different keys", async () => {
    // Reported rather than thrown: Caddy stops routing so nothing is written
    // under the wrong keys, but the container stays up to be read.
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    query.mockResolvedValue([{ 1: 1 }])
    administratorMfaKeyIsReady.mockReturnValue(true)
    checkKeyIdentity.mockResolvedValue({ status: "mismatch", mismatched: ["patient lookup"] })

    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.keyIdentity).toBe("mismatch")
    expect(body.message).toContain("escrow")
  })

  it("stays ready once an operator has accepted the mismatch", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    query.mockResolvedValue([{ 1: 1 }])
    administratorMfaKeyIsReady.mockReturnValue(true)
    checkKeyIdentity.mockResolvedValue({ status: "overridden", reason: "keys lost" })

    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).keyIdentity).toBe("overridden")
  })

  afterAll(() => {
    if (originalMfaRequired === undefined) delete process.env.LOSPOR_ADMIN_MFA_REQUIRED
    else process.env.LOSPOR_ADMIN_MFA_REQUIRED = originalMfaRequired
    if (originalDeploymentMode === undefined) delete process.env.LOSPOR_DEPLOYMENT_MODE
    else process.env.LOSPOR_DEPLOYMENT_MODE = originalDeploymentMode
  })
})
