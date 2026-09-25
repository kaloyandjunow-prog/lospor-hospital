import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  boundedJson: vi.fn(),
  parse: vi.fn(),
  publish: vi.fn(),
  controlPlaneError: vi.fn((error: unknown) => NextResponse.json({ code: error instanceof Error ? error.message : "ERROR" }, { status: 400 })),
}))

vi.mock("@/lib/hospital/control-plane", () => ({
  preopProfileUpdateSchema: { parse: mocks.parse },
  updateHospitalPreopProfile: mocks.publish,
}))
vi.mock("@/lib/hospital/control-plane-http", () => ({
  ACCOUNT_CONTROL_HEADERS: { "cache-control": "no-store" },
  authorizeAccountControl: mocks.authorize,
  boundedJson: mocks.boundedJson,
  controlPlaneError: mocks.controlPlaneError,
}))

describe("internal preoperative profile publication boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue(null)
    mocks.boundedJson.mockResolvedValue({ questions: [], reason: "Approved profile change" })
    mocks.parse.mockImplementation((value: unknown) => value)
    mocks.publish.mockResolvedValue({ id: "profile-2", version: 2 })
  })

  it("rejects an unauthorised control-plane request before reading the body", async () => {
    mocks.authorize.mockResolvedValue(NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 }))
    const { POST } = await import("./route")
    const response = await POST(new NextRequest("https://api.lospor.org/v1/internal/hospital/control-plane/preop-profile", { method: "POST" }))
    expect(response.status).toBe(401)
    expect(mocks.boundedJson).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it("parses and publishes the bounded profile payload", async () => {
    const { POST } = await import("./route")
    const response = await POST(new NextRequest("https://api.lospor.org/v1/internal/hospital/control-plane/preop-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questions: [], reason: "Approved profile change" }),
    }))
    expect(response.status).toBe(201)
    expect(mocks.parse).toHaveBeenCalledWith({ questions: [], reason: "Approved profile change" })
    expect(mocks.publish).toHaveBeenCalledWith({ questions: [], reason: "Approved profile change" })
  })
})
