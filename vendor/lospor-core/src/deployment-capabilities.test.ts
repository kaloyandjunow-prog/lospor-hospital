import { describe, expect, it } from "vitest"
import {
  isVersionAtLeast,
  parseAuthenticationCapabilities,
  parseClinicalAiCapabilities,
  parseDeploymentCapabilities,
  parsePediatricModeCapability,
  safeAuthenticationCapabilities,
  safeClinicalAiCapabilities,
  safePediatricModeCapability,
} from "./deployment-capabilities"

const CLIENT = "9.7.0"

function pediatricResponse(over: Record<string, unknown> = {}) {
  return {
    features: {
      pediatricMode: {
        enabled: true,
        productionReady: true,
        rulesetVersion: "2026.02",
        minimumClientVersion: "9.0.0",
        reviewedDoseProfilesRequired: true,
        ...over,
      },
    },
  }
}

describe("paediatric mode, as the deployment declares it", () => {
  it("opens only on the complete reviewed contract", () => {
    expect(parsePediatricModeCapability(pediatricResponse(), CLIENT)).toEqual({
      enabled: true,
      reason: "ENABLED",
      productionReady: true,
      rulesetVersion: "2026.02",
      minimumClientVersion: "9.0.0",
      reviewedDoseProfilesRequired: true,
    })
  })

  /**
   * A ruleset that exists but is not signed off, and a deployment that has
   * switched the feature off, are different situations and send the reader to
   * different people. The two clients each collapsed one of these into the
   * other, which is why it is now its own reason.
   */
  it("separates an unreviewed ruleset from a deployment that turned it off", () => {
    expect(parsePediatricModeCapability(pediatricResponse({ productionReady: false }), CLIENT))
      .toMatchObject({ enabled: false, reason: "NOT_CLINICALLY_REVIEWED" })
    expect(parsePediatricModeCapability(pediatricResponse({ enabled: false }), CLIENT))
      .toMatchObject({ enabled: false, reason: "DISABLED_BY_DEPLOYMENT" })
  })

  // Unreviewed wins when both are true: it is the more important of the two.
  it("calls an unreviewed and disabled ruleset unreviewed", () => {
    expect(parsePediatricModeCapability(
      pediatricResponse({ enabled: false, productionReady: false }),
      CLIENT,
    )).toMatchObject({ reason: "NOT_CLINICALLY_REVIEWED" })
  })

  it("keeps what the server declared even while refusing to open", () => {
    expect(parsePediatricModeCapability(pediatricResponse({ enabled: false }), CLIENT))
      .toMatchObject({ rulesetVersion: "2026.02", minimumClientVersion: "9.0.0" })
  })

  it("holds the feature shut until the client is new enough", () => {
    expect(parsePediatricModeCapability(
      pediatricResponse({ minimumClientVersion: "9.9.0" }),
      CLIENT,
    )).toMatchObject({ enabled: false, reason: "CLIENT_UPDATE_REQUIRED" })
  })

  /**
   * The same server used to open paediatric mode on one client and read as an
   * unparseable contract on the other, purely over this character.
   */
  it("reads a v-prefixed minimum version rather than refusing the contract", () => {
    expect(parsePediatricModeCapability(
      pediatricResponse({ minimumClientVersion: "v9.0.0" }),
      CLIENT,
    )).toMatchObject({ enabled: true, reason: "ENABLED" })
  })

  it.each([
    ["nothing at all", null],
    ["a response with no features", {}],
    ["a truthy non-object", { features: { pediatricMode: true } }],
    ["a missing review flag", pediatricResponse({ reviewedDoseProfilesRequired: undefined })],
    ["review declined rather than required", pediatricResponse({ reviewedDoseProfilesRequired: false })],
    ["a blank ruleset version", pediatricResponse({ rulesetVersion: "   " })],
    ["an unbounded ruleset version", pediatricResponse({ rulesetVersion: "x".repeat(129) })],
    ["an unreadable minimum version", pediatricResponse({ minimumClientVersion: "latest" })],
    ["enabled asserted as a string", pediatricResponse({ enabled: "true" })],
  ])("stays shut on %s", (_name, value) => {
    expect(parsePediatricModeCapability(value, CLIENT))
      .toEqual(safePediatricModeCapability())
  })

  // Each caller keeps its own object. One screen must not be able to change
  // what the next screen reads.
  it("hands out a fresh refusal each time", () => {
    const first = parsePediatricModeCapability(null, CLIENT)
    first.enabled = true
    expect(parsePediatricModeCapability(null, CLIENT).enabled).toBe(false)
  })
})

describe("comparing client versions", () => {
  it.each([
    ["9.7.0", "9.7.0", true],
    ["9.7.1", "9.7.0", true],
    ["10.0.0", "9.9.9", true],
    ["9.6.9", "9.7.0", false],
    ["9.7.0-beta.1", "9.7.0", true],
    ["not-a-version", "9.7.0", false],
    ["9.7.0", "not-a-version", false],
  ])("%s against a required %s is %s", (actual, required, expected) => {
    expect(isVersionAtLeast(actual, required)).toBe(expected)
  })
})

describe("clinical AI, as the deployment declares it", () => {
  it("enables only what is explicitly enabled", () => {
    expect(parseClinicalAiCapabilities({
      features: {
        clinicalAi: {
          clinicalAdvice: { enabled: true, reason: "ENABLED" },
          labImageExtraction: { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" },
        },
      },
    })).toEqual({
      clinicalAdvice: { enabled: true, reason: "ENABLED" },
      labImageExtraction: { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" },
      monitorOcr: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
    })
  })

  // "enabled" without the matching reason is a half-formed answer, and a
  // half-formed answer is not permission.
  it("refuses a capability enabled without a reason", () => {
    expect(parseClinicalAiCapabilities({
      features: { clinicalAi: { clinicalAdvice: { enabled: true } } },
    }).clinicalAdvice).toEqual({ enabled: false, reason: "PROVIDER_NOT_CONFIGURED" })
  })

  it("turns everything off for a response it cannot read", () => {
    expect(parseClinicalAiCapabilities(null)).toEqual(safeClinicalAiCapabilities())
  })
})

describe("how a deployment says people sign in", () => {
  it("accepts an explicit username policy", () => {
    expect(parseAuthenticationCapabilities({
      authentication: {
        loginIdentifier: "USERNAME",
        selfRegistration: false,
        passwordRecovery: "ADMINISTRATOR",
      },
    })).toEqual({
      status: "EXPLICIT",
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    })
  })

  it("reads the pre-loginIdentifier public contract as it was meant", () => {
    expect(parseAuthenticationCapabilities({
      authentication: { selfRegistration: true, passwordRecovery: "EMAIL" },
    })).toEqual({
      status: "LEGACY_PUBLIC",
      loginIdentifier: "EMAIL",
      selfRegistration: true,
      passwordRecovery: "EMAIL",
    })
  })

  /**
   * Both of these describe a deployment that cannot mean what it says. The
   * registration form makes email accounts, and email recovery cannot find a
   * username-only account without inventing the email fallback the policy
   * exists to forbid.
   */
  it.each([
    ["username sign-in with public registration", { loginIdentifier: "USERNAME", selfRegistration: true, passwordRecovery: "ADMINISTRATOR" }],
    ["username sign-in with email recovery", { loginIdentifier: "USERNAME", selfRegistration: false, passwordRecovery: "EMAIL" }],
    ["an unknown identifier", { loginIdentifier: "BADGE", selfRegistration: false, passwordRecovery: "ADMINISTRATOR" }],
    ["an unknown recovery route", { loginIdentifier: "EMAIL", selfRegistration: false, passwordRecovery: "SMS" }],
    ["registration left unstated", { loginIdentifier: "EMAIL", passwordRecovery: "ADMINISTRATOR" }],
    ["an old contract with no email recovery", { selfRegistration: false, passwordRecovery: "ADMINISTRATOR" }],
  ])("refuses %s", (_name, authentication) => {
    expect(parseAuthenticationCapabilities({ authentication }))
      .toEqual(safeAuthenticationCapabilities())
  })

  it.each([
    ["no response", null],
    ["no authentication block", {}],
    ["an array", { authentication: [] }],
  ])("refuses %s", (_name, value) => {
    expect(parseAuthenticationCapabilities(value)).toEqual(safeAuthenticationCapabilities())
  })
})

describe("the whole declaration at once", () => {
  it("parses each part independently of the others", () => {
    const parsed = parseDeploymentCapabilities({
      authentication: { loginIdentifier: "EMAIL", selfRegistration: false, passwordRecovery: "ADMINISTRATOR" },
      features: { clinicalAi: "broken", pediatricMode: pediatricResponse().features.pediatricMode },
    }, CLIENT)

    expect(parsed.authentication.status).toBe("EXPLICIT")
    expect(parsed.clinicalAi).toEqual(safeClinicalAiCapabilities())
    expect(parsed.pediatricMode.enabled).toBe(true)
  })
})
