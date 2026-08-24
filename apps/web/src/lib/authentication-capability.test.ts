import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearAuthenticationCapabilityCache,
  LEGACY_PUBLIC_AUTHENTICATION_CAPABILITY,
  loadAuthenticationCapability,
  parseAuthenticationCapability,
} from "./authentication-capability"

describe("authentication deployment capability", () => {
  afterEach(() => {
    clearAuthenticationCapabilityCache()
    vi.restoreAllMocks()
  })

  it("preserves the explicit public email workflow", () => {
    expect(parseAuthenticationCapability({
      authentication: {
        loginIdentifier: "EMAIL",
        selfRegistration: true,
        passwordRecovery: "EMAIL",
      },
    })).toEqual(LEGACY_PUBLIC_AUTHENTICATION_CAPABILITY)
  })

  it("supports the released pre-1.2 public contract without loginIdentifier", () => {
    expect(parseAuthenticationCapability({
      authentication: { selfRegistration: true, passwordRecovery: "EMAIL" },
    })).toEqual(LEGACY_PUBLIC_AUTHENTICATION_CAPABILITY)
  })

  it("switches only an explicit USERNAME identifier to the Hospital workflow", () => {
    expect(parseAuthenticationCapability({
      authentication: {
        loginIdentifier: "USERNAME",
        selfRegistration: false,
        passwordRecovery: "ADMINISTRATOR",
      },
    })).toEqual({
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    })
  })

  it("mounts no form when a USERNAME response is contradictory", () => {
    expect(parseAuthenticationCapability({
      authentication: {
        loginIdentifier: "USERNAME",
        selfRegistration: true,
        passwordRecovery: "EMAIL",
      },
    })).toBeNull()
  })

  it("mounts no form for the API's explicit unavailable Hospital state", () => {
    expect(parseAuthenticationCapability({
      authentication: {
        loginIdentifier: "USERNAME",
        selfRegistration: false,
        passwordRecovery: "UNAVAILABLE",
      },
    })).toBeNull()
  })

  it("honours an email deployment that deliberately disables self-service", () => {
    expect(parseAuthenticationCapability({
      authentication: {
        loginIdentifier: "EMAIL",
        selfRegistration: false,
        passwordRecovery: "ADMINISTRATOR",
      },
    })).toEqual({
      loginIdentifier: "EMAIL",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    })
  })

  it("maps the retired UNAVAILABLE recovery value to a hidden email flow", () => {
    expect(parseAuthenticationCapability({
      authentication: { selfRegistration: true, passwordRecovery: "UNAVAILABLE" },
    })).toEqual({
      loginIdentifier: "EMAIL",
      selfRegistration: true,
      passwordRecovery: "ADMINISTRATOR",
    })
  })

  it.each([
    { authentication: { loginIdentifier: "PHONE", selfRegistration: true, passwordRecovery: "EMAIL" } },
    { authentication: { loginIdentifier: "EMAIL", selfRegistration: "yes", passwordRecovery: "EMAIL" } },
    { authentication: { loginIdentifier: "EMAIL", selfRegistration: true, passwordRecovery: "SMS" } },
    { authentication: { loginIdentifier: "EMAIL", selfRegistration: true } },
  ])("fails closed for a malformed explicit policy (%j)", value => {
    expect(parseAuthenticationCapability(value)).toBeNull()
  })

  it.each([null, {}, { authentication: true }])(
    "fails closed for an absent or malformed authentication policy (%j)",
    value => {
      expect(parseAuthenticationCapability(value)).toBeNull()
    },
  )

  it("loads once, uses same-origin no-store semantics, and caches the result", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      authentication: {
        loginIdentifier: "USERNAME",
        selfRegistration: false,
        passwordRecovery: "ADMINISTRATOR",
      },
    }), { status: 200 }))

    const [first, second] = await Promise.all([
      loadAuthenticationCapability(),
      loadAuthenticationCapability(),
    ])
    const third = await loadAuthenticationCapability()

    expect(first).toEqual(second)
    expect(third?.loginIdentifier).toBe("USERNAME")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith("/api/capabilities", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
  })

  it("does not provide an email fallback when the capability endpoint is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"))
    await expect(loadAuthenticationCapability()).resolves.toBeNull()
  })
})
