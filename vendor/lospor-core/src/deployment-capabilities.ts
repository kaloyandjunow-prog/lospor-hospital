/**
 * What the deployment says it can do, read out of the capabilities endpoint.
 *
 * Every client asks the same server the same question, so the answer is read
 * the same way here. What stays with each client is fetching and caching it:
 * one uses the browser's fetch and the page's focus events, the other a bearer
 * token and the app's foreground state, and neither belongs in shared logic.
 *
 * The rule throughout is that anything not understood is off. A capability
 * turned on by a malformed response is a clinical feature opened by a proxy
 * error, and paediatric dosing is the feature in question.
 */

export type CapabilityReason =
  | "ENABLED"
  | "DISABLED_BY_DEPLOYMENT"
  | "PROVIDER_NOT_CONFIGURED"

export type RuntimeCapability = {
  enabled: boolean
  reason: CapabilityReason
}

export type ClinicalAiCapabilities = {
  clinicalAdvice: RuntimeCapability
  labImageExtraction: RuntimeCapability
  monitorOcr: RuntimeCapability
}

/**
 * Why paediatric mode is not available, kept at the granularity of the reasons
 * that mean different things to the person reading them.
 *
 * The two clients each collapsed a different pair of these and so answered
 * differently about the same deployment. `NOT_CLINICALLY_REVIEWED` is the one
 * worth naming separately: a ruleset present but not signed off is not the
 * hospital having switched the feature off, and saying so sends an
 * anaesthesiologist to ask the wrong person.
 */
export type PediatricModeCapabilityReason =
  | "ENABLED"
  | "DISABLED_BY_DEPLOYMENT"
  | "NOT_CLINICALLY_REVIEWED"
  | "CLIENT_UPDATE_REQUIRED"
  | "INVALID_CONTRACT"

export type PediatricModeCapability = {
  enabled: boolean
  reason: PediatricModeCapabilityReason
  productionReady: boolean
  rulesetVersion: string | null
  minimumClientVersion: string | null
  reviewedDoseProfilesRequired: boolean
}

export type LoginIdentifier = "EMAIL" | "USERNAME"

export type PasswordRecoveryCapability =
  | "EMAIL"
  | "ADMINISTRATOR"
  | "UNAVAILABLE"

export type AuthenticationCapabilityStatus =
  | "EXPLICIT"
  | "LEGACY_PUBLIC"
  | "INVALID_CONTRACT"

export type AuthenticationCapabilities = {
  status: AuthenticationCapabilityStatus
  loginIdentifier: LoginIdentifier | null
  selfRegistration: boolean
  passwordRecovery: PasswordRecoveryCapability
}

export type DeploymentCapabilities = {
  authentication: AuthenticationCapabilities
  clinicalAi: ClinicalAiCapabilities
  pediatricMode: PediatricModeCapability
}

/** A fresh object each time: callers hold these and one must not reach another. */
const unavailable = (): RuntimeCapability => ({
  enabled: false,
  reason: "PROVIDER_NOT_CONFIGURED",
})

export function safeClinicalAiCapabilities(): ClinicalAiCapabilities {
  return {
    clinicalAdvice: unavailable(),
    labImageExtraction: unavailable(),
    monitorOcr: unavailable(),
  }
}

export function safePediatricModeCapability(): PediatricModeCapability {
  return {
    enabled: false,
    reason: "INVALID_CONTRACT",
    productionReady: false,
    rulesetVersion: null,
    minimumClientVersion: null,
    reviewedDoseProfilesRequired: false,
  }
}

export function safeAuthenticationCapabilities(): AuthenticationCapabilities {
  return {
    status: "INVALID_CONTRACT",
    loginIdentifier: null,
    selfRegistration: false,
    passwordRecovery: "UNAVAILABLE",
  }
}

export function safeDeploymentCapabilities(): DeploymentCapabilities {
  return {
    authentication: safeAuthenticationCapabilities(),
    clinicalAi: safeClinicalAiCapabilities(),
    pediatricMode: safePediatricModeCapability(),
  }
}

function runtimeCapability(value: unknown): RuntimeCapability {
  if (!value || typeof value !== "object") return unavailable()
  const candidate = value as { enabled?: unknown; reason?: unknown }
  if (candidate.enabled === true && candidate.reason === "ENABLED") {
    return { enabled: true, reason: "ENABLED" }
  }
  if (candidate.reason === "DISABLED_BY_DEPLOYMENT") {
    return { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" }
  }
  return unavailable()
}

/**
 * A leading `v` is tolerated on the way in and nowhere else. One client
 * accepted it and the other did not, so the same server could open paediatric
 * mode on the web and refuse it on the phone as an unreadable contract -- a
 * false refusal, which for a gate is the expensive direction to be wrong in.
 */
function versionParts(value: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(value.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function isVersionAtLeast(actualValue: string, requiredValue: string): boolean {
  const actual = versionParts(actualValue)
  const required = versionParts(requiredValue)
  if (!actual || !required) return false
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] > required[index]) return true
    if (actual[index] < required[index]) return false
  }
  return true
}

const MAX_RULESET_VERSION_LENGTH = 128

/**
 * Paediatric writes open only on the complete reviewed contract. A partial,
 * contradictory or future declaration stays readable and opens nothing, so a
 * network, proxy or schema fault can never reveal a new paediatric path.
 *
 * `clientVersion` is the calling app's own version -- the one platform fact in
 * the decision, and the reason this takes an argument rather than reading a
 * constant.
 */
export function parsePediatricModeCapability(
  value: unknown,
  clientVersion: string,
): PediatricModeCapability {
  const feature = value && typeof value === "object"
    ? (value as { features?: { pediatricMode?: unknown } }).features?.pediatricMode
    : null
  if (!feature || typeof feature !== "object") return safePediatricModeCapability()

  const candidate = feature as Record<string, unknown>
  const rulesetVersion = typeof candidate.rulesetVersion === "string"
    ? candidate.rulesetVersion.trim()
    : ""
  const minimumClientVersion = typeof candidate.minimumClientVersion === "string"
    ? candidate.minimumClientVersion.trim()
    : ""
  const exactShape = typeof candidate.enabled === "boolean"
    && typeof candidate.productionReady === "boolean"
    && rulesetVersion.length > 0
    && rulesetVersion.length <= MAX_RULESET_VERSION_LENGTH
    && versionParts(minimumClientVersion) !== null
    && candidate.reviewedDoseProfilesRequired === true
  if (!exactShape) return safePediatricModeCapability()

  const declared = {
    productionReady: candidate.productionReady as boolean,
    rulesetVersion,
    minimumClientVersion,
    reviewedDoseProfilesRequired: true,
  }

  // Reviewed before permitted, in that order: a ruleset nobody has signed off
  // is unreviewed whether or not the deployment also has it switched off, and
  // that is the more important of the two things to say.
  if (candidate.productionReady !== true) {
    return { enabled: false, reason: "NOT_CLINICALLY_REVIEWED", ...declared }
  }
  if (candidate.enabled !== true) {
    return { enabled: false, reason: "DISABLED_BY_DEPLOYMENT", ...declared }
  }
  if (!isVersionAtLeast(clientVersion, minimumClientVersion)) {
    return { enabled: false, reason: "CLIENT_UPDATE_REQUIRED", ...declared }
  }
  return { enabled: true, reason: "ENABLED", ...declared }
}

export function parseClinicalAiCapabilities(value: unknown): ClinicalAiCapabilities {
  const clinicalAi = value && typeof value === "object"
    ? (value as { features?: { clinicalAi?: unknown } }).features?.clinicalAi
    : null
  const source = clinicalAi && typeof clinicalAi === "object"
    ? clinicalAi as Partial<Record<keyof ClinicalAiCapabilities, unknown>>
    : {}
  return {
    clinicalAdvice: runtimeCapability(source.clinicalAdvice),
    labImageExtraction: runtimeCapability(source.labImageExtraction),
    monitorOcr: runtimeCapability(source.monitorOcr),
  }
}

/**
 * Authentication is parsed apart from the optional clinical features because it
 * is the one that decides who gets in. The sole compatibility case is the exact
 * pre-`loginIdentifier` public email-recovery contract, whose explicit
 * registration boolean is preserved. An absent object, a partial hospital
 * policy, or an unknown enum value never falls back to email authentication.
 */
export function parseAuthenticationCapabilities(value: unknown): AuthenticationCapabilities {
  const authentication = value && typeof value === "object"
    ? (value as { authentication?: unknown }).authentication
    : null
  if (!authentication || typeof authentication !== "object" || Array.isArray(authentication)) {
    return safeAuthenticationCapabilities()
  }

  const candidate = authentication as Record<string, unknown>
  const selfRegistration = candidate.selfRegistration
  const passwordRecovery = candidate.passwordRecovery
  const validRecovery = passwordRecovery === "EMAIL"
    || passwordRecovery === "ADMINISTRATOR"
    || passwordRecovery === "UNAVAILABLE"

  if (typeof selfRegistration !== "boolean" || !validRecovery) {
    return safeAuthenticationCapabilities()
  }

  if (candidate.loginIdentifier === undefined) {
    if (passwordRecovery === "EMAIL") {
      return {
        status: "LEGACY_PUBLIC",
        loginIdentifier: "EMAIL",
        selfRegistration,
        passwordRecovery: "EMAIL",
      }
    }
    return safeAuthenticationCapabilities()
  }

  if (candidate.loginIdentifier !== "EMAIL" && candidate.loginIdentifier !== "USERNAME") {
    return safeAuthenticationCapabilities()
  }

  // The public registration form creates email accounts only. A username
  // deployment claiming self-registration would offer the wrong
  // account-creation path, so that contradictory contract is invalid.
  if (candidate.loginIdentifier === "USERNAME" && selfRegistration) {
    return safeAuthenticationCapabilities()
  }
  // Email recovery cannot identify a username-only account without creating
  // the forbidden implicit email fallback.
  if (candidate.loginIdentifier === "USERNAME" && passwordRecovery === "EMAIL") {
    return safeAuthenticationCapabilities()
  }

  return {
    status: "EXPLICIT",
    loginIdentifier: candidate.loginIdentifier,
    selfRegistration,
    passwordRecovery,
  }
}

export function parseDeploymentCapabilities(
  value: unknown,
  clientVersion: string,
): DeploymentCapabilities {
  return {
    authentication: parseAuthenticationCapabilities(value),
    clinicalAi: parseClinicalAiCapabilities(value),
    pediatricMode: parsePediatricModeCapability(value, clientVersion),
  }
}
