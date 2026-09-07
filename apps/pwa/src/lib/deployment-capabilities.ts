import { useEffect, useState } from "react"
import { AppState } from "react-native"
import {
  parseDeploymentCapabilities,
  safeDeploymentCapabilities,
  type AuthenticationCapabilities,
  type CapabilityReason,
  type ClinicalAiCapabilities,
  type DeploymentCapabilities,
  type PediatricModeCapability,
} from "@lospor/core/deployment-capabilities"
import { apiFetch } from "./api"
import { LOSPOR_MOBILE_CLIENT_VERSION } from "./client-version"

/**
 * The EHR import capability is appliance-only, so it is declared and parsed
 * here rather than in core, and rides alongside core's own capabilities.
 */
export type EhrImportCapability = {
  enabled: boolean
  reason: CapabilityReason
  /** Which transport this site is configured for, or null when none is. */
  transport: "FOLDER" | "FHIR" | "HL7V2" | null
  /** Whether a patient may be looked up by national identifier here. */
  egnPermitted: boolean
}

type ApplianceCapabilities = DeploymentCapabilities & { ehrImport: EhrImportCapability }

/**
 * Off until the server says otherwise.
 *
 * The safe default matters more here than for most capabilities: showing an
 * import control on a deployment with no hospital system behind it offers a
 * clinician something that can only fail.
 */
export const SAFE_EHR_IMPORT_CAPABILITY: EhrImportCapability = {
  enabled: false,
  reason: "PROVIDER_NOT_CONFIGURED",
  transport: null,
  egnPermitted: false,
}

/** Fails closed: anything but an explicit enabled/ENABLED reads as unavailable. */
function runtimeCapability(value: Record<string, unknown>): { enabled: boolean; reason: CapabilityReason } {
  if (value.enabled === true && value.reason === "ENABLED") {
    return { enabled: true, reason: "ENABLED" }
  }
  if (value.reason === "DISABLED_BY_DEPLOYMENT") {
    return { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" }
  }
  return { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" }
}

export function parseEhrImportCapability(value: unknown): EhrImportCapability {
  const features = (value as { features?: unknown })?.features
  const raw = (features as { ehrImport?: unknown })?.ehrImport
  if (!raw || typeof raw !== "object") return { ...SAFE_EHR_IMPORT_CAPABILITY }
  const candidate = raw as Record<string, unknown>
  const transport = candidate.transport
  return {
    ...runtimeCapability(candidate),
    transport: transport === "FOLDER" || transport === "FHIR" || transport === "HL7V2"
      ? transport
      : null,
    egnPermitted: candidate.egnPermitted === true,
  }
}

function safeApplianceCapabilities(): ApplianceCapabilities {
  return { ...safeDeploymentCapabilities(), ehrImport: { ...SAFE_EHR_IMPORT_CAPABILITY } }
}

/**
 * Reading the deployment's declaration is shared logic and lives in core.
 * What is left here is this app's half of it: the bearer-authenticated
 * request, one cache the whole app reads, and a refresh when the phone comes
 * back to the foreground.
 */

export type {
  AuthenticationCapabilities,
  AuthenticationCapabilityStatus,
  CapabilityReason,
  ClinicalAiCapabilities,
  DeploymentCapabilities,
  LoginIdentifier,
  PasswordRecoveryCapability,
  PediatricModeCapability,
  PediatricModeCapabilityReason,
  RuntimeCapability,
} from "@lospor/core/deployment-capabilities"

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

let cached: ApplianceCapabilities | null = null
let loading: Promise<ApplianceCapabilities> | null = null
let authenticationLoading: Promise<AuthenticationCapabilities> | null = null
let clinicalAiLoading: Promise<ClinicalAiCapabilities> | null = null
let pediatricModeLoading: Promise<PediatricModeCapability> | null = null
let cacheEpoch = 0
const CAPABILITY_REFRESH_INTERVAL_MS = 15_000

function loadDeploymentCapabilities(): Promise<ApplianceCapabilities> {
  if (cached) return Promise.resolve(cached)
  if (loading) return loading
  const epoch = cacheEpoch
  const request = apiFetch("/api/capabilities", { method: "GET" })
    .then(async response => {
      if (!response.ok) return safeApplianceCapabilities()
      // Read once: core parses what it owns, and the appliance's own EHR
      // capability is parsed from the same body rather than a second request.
      const body = await response.json().catch(() => null)
      return {
        ...parseDeploymentCapabilities(body, LOSPOR_MOBILE_CLIENT_VERSION),
        ehrImport: parseEhrImportCapability(body),
      }
    })
    .catch(() => safeApplianceCapabilities())
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

function refreshDeploymentCapabilities(): Promise<ApplianceCapabilities> {
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

export function useDeploymentCapabilities(): ApplianceCapabilities {
  const [capabilities, setCapabilities] = useState(
    () => cached ?? safeApplianceCapabilities(),
  )
  useEffect(() => {
    let active = true
    let requestSequence = 0
    const apply = (request: Promise<ApplianceCapabilities>) => {
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
