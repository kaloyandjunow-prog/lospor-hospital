import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearAuthenticationCapabilityCache,
  loadAuthenticationCapability,
  parseAuthenticationCapability,
} from "./authentication-capability"

describe("authentication capability", () => {
  beforeEach(() => {
    clearAuthenticationCapabilityCache()
    vi.restoreAllMocks()
  })

  it("accepts the exact Hospital username tuple", () => {
    expect(parseAuthenticationCapability({ authentication: {
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    } })).toEqual({
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    })
  })

  it.each([
    null,
    {},
    { authentication: null },
    { authentication: { loginIdentifier: "USERNAME", selfRegistration: true, passwordRecovery: "ADMINISTRATOR" } },
    { authentication: { loginIdentifier: "USERNAME", selfRegistration: false, passwordRecovery: "EMAIL" } },
    { authentication: { loginIdentifier: "HANDLE", selfRegistration: false, passwordRecovery: "ADMINISTRATOR" } },
  ])("fails a missing or contradictory Hospital contract closed", value => {
    expect(parseAuthenticationCapability(value)).toBeNull()
  })

  it("retains the explicit and legacy public email contract", () => {
    expect(parseAuthenticationCapability({ authentication: {
      selfRegistration: true,
      passwordRecovery: "EMAIL",
    } })).toMatchObject({ loginIdentifier: "EMAIL", selfRegistration: true })
  })

  it("shares one capability request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ authentication: {
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    } }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    await Promise.all([loadAuthenticationCapability(), loadAuthenticationCapability()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
