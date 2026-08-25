import { useEffect, useState } from "react"
import { AppState } from "react-native"
import { apiFetch } from "./api"
import { LOSPOR_MOBILE_CLIENT_VERSION } from "./client-version"
import type { LoginIdentifier } from "./login-identifier"

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

export type PediatricModeCapabilityReason =
  | "ENABLED"
  | "DISABLED_BY_DEPLOYMENT"
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

export type ClinicalAiUnavailableMessageKey =
  | "externalAiDisabledDeployment"
  | "externalAiProviderUnavailable"

export function capabilityMessageKey(
  reason: CapabilityReason,
): ClinicalAiUnavailableMessageKey {
  return reason === "DISABLED_BY_DEPLOYMENT"
    ? "externalAiDisabledDeployment"
    : "externalAiProviderUnavailable"
}

const unavailable: RuntimeCapability = {
  enabled: false,
  reason: "PROVIDER_NOT_CONFIGURED",
}

export const SAFE_CLINICAL_AI_CAPABILITIES: ClinicalAiCapabilities = {
  clinicalAdvice: unavailable,
  labImageExtraction: unavailable,
  monitorOcr: unavailable,
}

export const SAFE_PEDIATRIC_MODE_CAPABILITY: PediatricModeCapability = {
  enabled: false,
  reason: "INVALID_CONTRACT",
  productionReady: false,
  rulesetVersion: null,
  minimumClientVersion: null,
  reviewedDoseProfilesRequired: false,
}

export const SAFE_AUTHENTICATION_CAPABILITIES: AuthenticationCapabilities = {
  status: "INVALID_CONTRACT",
  loginIdentifier: null,
  selfRegistration: false,
  passwordRecovery: "UNAVAILABLE",
}

const SAFE_DEPLOYMENT_CAPABILITIES: DeploymentCapabilities = {
  authentication: SAFE_AUTHENTICATION_CAPABILITIES,
  clinicalAi: SAFE_CLINICAL_AI_CAPABILITIES,
  pediatricMode: SAFE_PEDIATRIC_MODE_CAPABILITY,
}

function runtimeCapability(value: unknown): RuntimeCapability {
  if (!value || typeof value !== "object") return { ...unavailable }
  const candidate = value as { enabled?: unknown; reason?: unknown }
  if (candidate.enabled === true && candidate.reason === "ENABLED") {
    return { enabled: true, reason: "ENABLED" }
  }
  if (candidate.reason === "DISABLED_BY_DEPLOYMENT") {
    return { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" }
  }
  return { ...unavailable }
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

function versionParts(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(version.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function versionAtLeast(version: string, minimum: string): boolean {
  const actual = versionParts(version)
  const required = versionParts(minimum)
  if (!actual || !required) return false
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] > required[index]) return true
    if (actual[index] < required[index]) return false
  }
  return true
}

/**
 * Parses the server's exact pediatric-mode declaration. Any missing, truthy,
 * partially shaped, clinically unreviewed, or client-incompatible declaration
 * remains unavailable, so a network/proxy/schema error can never reveal a new
 * Pediatric case path.
 */
export function parsePediatricModeCapability(value: unknown): PediatricModeCapability {
  const pediatricMode = value && typeof value === "object"
    ? (value as { features?: { pediatricMode?: unknown } }).features?.pediatricMode
    : null
  if (!pediatricMode || typeof pediatricMode !== "object") {
    return { ...SAFE_PEDIATRIC_MODE_CAPABILITY }
  }

  const candidate = pediatricMode as Record<string, unknown>
  const rulesetVersion = typeof candidate.rulesetVersion === "string"
    ? candidate.rulesetVersion.trim()
    : ""
  const minimumClientVersion = typeof candidate.minimumClientVersion === "string"
    ? candidate.minimumClientVersion.trim()
    : ""
  const exactShape = typeof candidate.enabled === "boolean"
    && typeof candidate.productionReady === "boolean"
    && rulesetVersion.length > 0
    && rulesetVersion.length <= 128
    && versionParts(minimumClientVersion) !== null
    && candidate.reviewedDoseProfilesRequired === true

  if (!exactShape) return { ...SAFE_PEDIATRIC_MODE_CAPABILITY }

  const parsed = {
    productionReady: candidate.productionReady as boolean,
    rulesetVersion,
    minimumClientVersion,
    reviewedDoseProfilesRequired: true,
  }
  if (candidate.enabled !== true || candidate.productionReady !== true) {
    return {
      enabled: false,
      reason: "DISABLED_BY_DEPLOYMENT",
      ...parsed,
    }
  }
  if (!versionAtLeast(LOSPOR_MOBILE_CLIENT_VERSION, minimumClientVersion)) {
    return {
      enabled: false,
      reason: "CLIENT_UPDATE_REQUIRED",
      ...parsed,
    }
  }
  return {
    enabled: true,
    reason: "ENABLED",
    ...parsed,
  }
}

/**
 * Authentication is security-sensitive and is therefore parsed independently
 * from optional clinical features. The sole compatibility case is the exact
 * pre-loginIdentifier public email-recovery contract; its explicit
 * registration boolean is preserved. An absent object, a partial Hospital
 * policy, or an unknown enum value never falls back to email authentication.
 */
export function parseAuthenticationCapabilities(value: unknown): AuthenticationCapabilities {
  const authentication = value && typeof value === "object"
    ? (value as { authentication?: unknown }).authentication
    : null
  if (!authentication || typeof authentication !== "object" || Array.isArray(authentication)) {
    return { ...SAFE_AUTHENTICATION_CAPABILITIES }
  }

  const candidate = authentication as Record<string, unknown>
  const selfRegistration = candidate.selfRegistration
  const passwordRecovery = candidate.passwordRecovery
  const validRecovery = passwordRecovery === "EMAIL"
    || passwordRecovery === "ADMINISTRATOR"
    || passwordRecovery === "UNAVAILABLE"

  if (typeof selfRegistration !== "boolean" || !validRecovery) {
    return { ...SAFE_AUTHENTICATION_CAPABILITIES }
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
    return { ...SAFE_AUTHENTICATION_CAPABILITIES }
  }

  if (candidate.loginIdentifier !== "EMAIL" && candidate.loginIdentifier !== "USERNAME") {
    return { ...SAFE_AUTHENTICATION_CAPABILITIES }
  }

  // The existing public registration form creates email accounts only. A
  // username deployment claiming self-registration would expose the wrong
  // account-creation path, so treat that contradictory contract as invalid.
  if (candidate.loginIdentifier === "USERNAME" && selfRegistration) {
    return { ...SAFE_AUTHENTICATION_CAPABILITIES }
  }
  // Email recovery cannot identify a username-only account without creating
  // the forbidden implicit email fallback.
  if (candidate.loginIdentifier === "USERNAME" && passwordRecovery === "EMAIL") {
    return { ...SAFE_AUTHENTICATION_CAPABILITIES }
  }

  return {
    status: "EXPLICIT",
    loginIdentifier: candidate.loginIdentifier,
    selfRegistration,
    passwordRecovery,
  }
}

export function parseDeploymentCapabilities(value: unknown): DeploymentCapabilities {
  return {
    authentication: parseAuthenticationCapabilities(value),
    clinicalAi: parseClinicalAiCapabilities(value),
    pediatricMode: parsePediatricModeCapability(value),
  }
}

let cached: DeploymentCapabilities | null = null
let loading: Promise<DeploymentCapabilities> | null = null
let authenticationLoading: Promise<AuthenticationCapabilities> | null = null
let clinicalAiLoading: Promise<ClinicalAiCapabilities> | null = null
let pediatricModeLoading: Promise<PediatricModeCapability> | null = null
let cacheEpoch = 0
const CAPABILITY_REFRESH_INTERVAL_MS = 15_000

function loadDeploymentCapabilities(): Promise<DeploymentCapabilities> {
  if (cached) return Promise.resolve(cached)
  if (loading) return loading
  const epoch = cacheEpoch
  const request = apiFetch("/api/capabilities", { method: "GET" })
    .then(async response => {
      if (!response.ok) return SAFE_DEPLOYMENT_CAPABILITIES
      return parseDeploymentCapabilities(await response.json().catch(() => null))
    })
    .catch(() => SAFE_DEPLOYMENT_CAPABILITIES)
    .then(result => {
      if (epoch === cacheEpoch) cached = result
      return result
    })
    .finally(() => {
      if (loading === request) loading = null
    })
  loading = request
  return request
}

function refreshDeploymentCapabilities(): Promise<DeploymentCapabilities> {
  cached = null
  if (loading) return loading
  return loadDeploymentCapabilities()
}

export function loadClinicalAiCapabilities(): Promise<ClinicalAiCapabilities> {
  if (cached) return Promise.resolve(cached.clinicalAi)
  if (clinicalAiLoading) return clinicalAiLoading
  const request = loadDeploymentCapabilities()
    .then(result => result.clinicalAi)
    .finally(() => {
      if (clinicalAiLoading === request) clinicalAiLoading = null
    })
  clinicalAiLoading = request
  return request
}

export function loadAuthenticationCapabilities(): Promise<AuthenticationCapabilities> {
  if (cached) return Promise.resolve(cached.authentication)
  if (authenticationLoading) return authenticationLoading
  const request = loadDeploymentCapabilities()
    .then(result => result.authentication)
    .finally(() => {
      if (authenticationLoading === request) authenticationLoading = null
    })
  authenticationLoading = request
  return request
}

export function loadPediatricModeCapability(): Promise<PediatricModeCapability> {
  if (cached) return Promise.resolve(cached.pediatricMode)
  if (pediatricModeLoading) return pediatricModeLoading
  const request = loadDeploymentCapabilities()
    .then(result => result.pediatricMode)
    .finally(() => {
      if (pediatricModeLoading === request) pediatricModeLoading = null
    })
  pediatricModeLoading = request
  return request
}

export function clearClinicalAiCapabilitiesCache(): void {
  cacheEpoch += 1
  cached = null
  loading = null
  authenticationLoading = null
  clinicalAiLoading = null
  pediatricModeLoading = null
}

export function refreshClinicalAiCapabilities(): Promise<ClinicalAiCapabilities> {
  if (clinicalAiLoading) return clinicalAiLoading
  const request = refreshDeploymentCapabilities()
    .then(result => result.clinicalAi)
    .finally(() => {
      if (clinicalAiLoading === request) clinicalAiLoading = null
    })
  clinicalAiLoading = request
  return request
}

export function refreshAuthenticationCapabilities(): Promise<AuthenticationCapabilities> {
  if (authenticationLoading) return authenticationLoading
  const request = refreshDeploymentCapabilities()
    .then(result => result.authentication)
    .finally(() => {
      if (authenticationLoading === request) authenticationLoading = null
    })
  authenticationLoading = request
  return request
}

export function refreshPediatricModeCapability(): Promise<PediatricModeCapability> {
  if (pediatricModeLoading) return pediatricModeLoading
  const request = refreshDeploymentCapabilities()
    .then(result => result.pediatricMode)
    .finally(() => {
      if (pediatricModeLoading === request) pediatricModeLoading = null
    })
  pediatricModeLoading = request
  return request
}

export function useDeploymentCapabilities(): DeploymentCapabilities {
  const [capabilities, setCapabilities] = useState(
    cached ?? SAFE_DEPLOYMENT_CAPABILITIES,
  )
  useEffect(() => {
    let active = true
    let requestSequence = 0
    const apply = (request: Promise<DeploymentCapabilities>) => {
      const sequence = ++requestSequence
      void request.then(value => {
        if (active && sequence === requestSequence) setCapabilities(value)
      })
    }
    const refresh = () => apply(refreshDeploymentCapabilities())

    apply(loadDeploymentCapabilities())
    const interval = setInterval(refresh, CAPABILITY_REFRESH_INTERVAL_MS)
    const subscription = AppState.addEventListener("change", nextState => {
      if (nextState === "active") refresh()
    })

    return () => {
      active = false
      clearInterval(interval)
      subscription.remove()
    }
  }, [])
  return capabilities
}

export function useClinicalAiCapabilities(): ClinicalAiCapabilities {
  return useDeploymentCapabilities().clinicalAi
}

export function useAuthenticationCapabilities(): AuthenticationCapabilities {
  return useDeploymentCapabilities().authentication
}

export function usePediatricModeCapability(): PediatricModeCapability {
  return useDeploymentCapabilities().pediatricMode
}
