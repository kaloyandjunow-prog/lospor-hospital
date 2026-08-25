import { describe, expect, it, vi } from "vitest"
import packageMetadata from "../../package.json"

vi.mock("server-only", () => ({}))

const { GET: getHealth } = await import("@/app/health/live/route")
const { GET: getCapabilities } = await import("@/app/v1/capabilities/route")
const { API_RELEASE_VERSION } = await import("@/lib/api-version")

describe("API release metadata", () => {
  it("uses package.json as the canonical release version", () => {
    expect(API_RELEASE_VERSION).toBe(packageMetadata.version)
  })

  it("reports the canonical version from health and capabilities", async () => {
    await expect(getHealth().json()).resolves.toMatchObject({
      service: "lospor-api",
      version: API_RELEASE_VERSION,
    })
    await expect(getCapabilities().then(res => res.json())).resolves.toMatchObject({
      apiVersion: "1",
      serviceVersion: API_RELEASE_VERSION,
      authentication: {
        loginIdentifier: expect.stringMatching(/^(EMAIL|USERNAME)$/),
        selfRegistration: expect.any(Boolean),
        passwordRecovery: expect.stringMatching(/^(EMAIL|ADMINISTRATOR|UNAVAILABLE)$/),
        passwordChange: true,
        sessionInventory: true,
      },
      features: {
        accountAdministration: {
          enabled: expect.any(Boolean),
          reason: expect.stringMatching(/^(ENABLED|DISABLED_BY_DEPLOYMENT)$/),
        },
      },
    })
  })
})
