import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearAccountAdministrationCapabilityCache,
  loadAccountAdministrationCapability,
  parseAccountAdministrationCapability,
} from "./account-administration-capability"

describe("account administration deployment capability", () => {
  afterEach(() => {
    clearAccountAdministrationCapabilityCache()
    vi.restoreAllMocks()
  })

  it("enables controls only for the exact Hospital capability", () => {
    expect(parseAccountAdministrationCapability({
      features: { accountAdministration: { enabled: true, reason: "ENABLED" } },
    })).toEqual({ enabled: true, reason: "ENABLED" })
  })

  it.each([
    null,
    {},
    { features: {} },
    { features: { accountAdministration: true } },
    { features: { accountAdministration: { enabled: true, reason: "DISABLED_BY_DEPLOYMENT" } } },
    { features: { accountAdministration: { enabled: true, reason: "unexpected" } } },
  ])("fails closed for Cloud Demo, missing, or malformed input", value => {
    expect(parseAccountAdministrationCapability(value)).toEqual({
      enabled: false,
      reason: "DISABLED_BY_DEPLOYMENT",
    })
  })

  it("fails closed when the capability endpoint is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"))
    await expect(loadAccountAdministrationCapability()).resolves.toEqual({
      enabled: false,
      reason: "DISABLED_BY_DEPLOYMENT",
    })
  })
})
