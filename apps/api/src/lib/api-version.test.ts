import { describe, expect, it, vi } from "vitest"
import packageMetadata from "../../package.json"

vi.mock("server-only", () => ({}))

// This asserts what the capability document reports about *itself* -- release
// version, API version, the shape of the authentication and administration
// blocks. Two of the values it assembles are read from the database, and only
// in Hospital mode, which is the mode this repository is; left alone, an
// ordinary unit run needs a PostgreSQL server to answer questions it never
// asks. Both are stubbed at the database boundary rather than at the capability
// functions, so the logic that shapes those answers still runs for real.
vi.mock("@/lib/hospital/external-ai-policy", async importActual => ({
  ...await importActual<typeof import("@/lib/hospital/external-ai-policy")>(),
  externalAiCapabilityState: vi.fn(async () => ({
    enabled: false,
    reason: "PROVIDER_NOT_CONFIGURED" as const,
    provider: "mistral" as const,
    policyEnabled: false,
    credentialStored: false,
    providerConfigured: false,
  })),
}))

vi.mock("@/lib/hospital/clinical-baseline-readiness", async importActual => ({
  ...await importActual<typeof import("@/lib/hospital/clinical-baseline-readiness")>(),
  assessSelectedHospitalClinicalBaseline: vi.fn(async (mode: string) => ({
    mode,
    baselineReady: false,
    reasonCode: "NO_SELECTION",
    expected: { key: "unit-test", version: 0 },
    selected: null,
  })),
}))

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
