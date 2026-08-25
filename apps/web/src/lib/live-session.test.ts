import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
}))

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}))

import { getLiveSession, getLiveSessionResult } from "./live-session"

const session = {
  user: {
    id: "user-1",
    email: "user@example.test",
    name: "Test User",
    role: "MEMBER",
    institutionId: null,
    institutionName: null,
    firstName: "Test",
    lastName: "User",
    title: "Dr",
    jti: "session-1",
    acceptedTermsAt: null,
    lastLoginAt: null,
  },
}

describe("getLiveSession", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mocks.cookies.mockResolvedValue({
      getAll: () => [{ name: "lospor_session", value: "signed-token" }],
    })
  })

  it("loads the authoritative session from the API", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(session), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    await expect(getLiveSession()).resolves.toEqual(session)
    const apiOrigin = (
      process.env.LOSPOR_API_INTERNAL_URL ?? "http://127.0.0.1:3002"
    ).replace(/\/$/, "")
    expect(request).toHaveBeenCalledWith(
      `${apiOrigin}/v1/auth/session`,
      expect.objectContaining({
        cache: "no-store",
        headers: expect.any(Headers),
      }),
    )
    const headers = request.mock.calls[0][1]?.headers as Headers
    expect(headers.get("cookie")).toBe("lospor_session=signed-token")
  })

  it("returns null when the API rejects the session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    )

    await expect(getLiveSession()).resolves.toBeNull()
  })

  it("returns null when the API is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"))

    await expect(getLiveSession()).resolves.toBeNull()
  })

  it("preserves CLINICAL_APP_FORBIDDEN for the login surface", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "CLINICAL_APP_FORBIDDEN" }), { status: 403 }),
    )

    await expect(getLiveSessionResult()).resolves.toEqual({
      session: null,
      errorCode: "CLINICAL_APP_FORBIDDEN",
    })
  })

  it("rejects a research-only account even if an older API returns a session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        user: { ...session.user, accountKind: "RESEARCH_ONLY" },
      }), { status: 200 }),
    )

    await expect(getLiveSessionResult()).resolves.toEqual({
      session: null,
      errorCode: "CLINICAL_APP_FORBIDDEN",
    })
  })
})
