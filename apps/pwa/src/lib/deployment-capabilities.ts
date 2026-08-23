import { useEffect, useState } from "react"
import { apiFetch } from "./api"

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

export type AuthenticationCapabilities = {
  status: "EXPLICIT" | "LEGACY_PUBLIC" | "INVALID_CONTRACT"
  loginIdentifier: "EMAIL" | "USERNAME" | null
  selfRegistration: boolean
  passwordRecovery: "EMAIL" | "ADMINISTRATOR" | "UNAVAILABLE"
}

export const SAFE_AUTHENTICATION_CAPABILITIES: AuthenticationCapabilities = {
  status: "INVALID_CONTRACT",
  loginIdentifier: null,
  selfRegistration: false,
  passwordRecovery: "UNAVAILABLE",
}

export function parseAuthenticationCapabilities(value: unknown): AuthenticationCapabilities {
  const authentication = value && typeof value === "object"
    ? (value as { authentication?: unknown }).authentication
    : null
  if (!authentication || typeof authentication !== "object" || Array.isArray(authentication)) {
    return { ...SAFE_AUTHENTICATION_CAPABILITIES }
  }
  const candidate = authentication as Record<string, unknown>
  if (typeof candidate.selfRegistration !== "boolean"
    || (candidate.passwordRecovery !== "EMAIL"
      && candidate.passwordRecovery !== "ADMINISTRATOR"
      && candidate.passwordRecovery !== "UNAVAILABLE")) {
    return { ...SAFE_AUTHENTICATION_CAPABILITIES }
  }
  if (candidate.loginIdentifier === undefined && candidate.passwordRecovery === "EMAIL") {
    return {
      status: "LEGACY_PUBLIC",
      loginIdentifier: "EMAIL",
      selfRegistration: candidate.selfRegistration,
      passwordRecovery: "EMAIL",
    }
  }
  if (candidate.loginIdentifier !== "EMAIL" && candidate.loginIdentifier !== "USERNAME") {
    return { ...SAFE_AUTHENTICATION_CAPABILITIES }
  }
  if (candidate.loginIdentifier === "USERNAME"
    && (candidate.selfRegistration || candidate.passwordRecovery === "EMAIL")) {
    return { ...SAFE_AUTHENTICATION_CAPABILITIES }
  }
  return {
    status: "EXPLICIT",
    loginIdentifier: candidate.loginIdentifier,
    selfRegistration: candidate.selfRegistration,
    passwordRecovery: candidate.passwordRecovery,
  }
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

const unavailable = (): RuntimeCapability => ({
  enabled: false,
  reason: "PROVIDER_NOT_CONFIGURED",
})

export const SAFE_CLINICAL_AI_CAPABILITIES: ClinicalAiCapabilities = {
  clinicalAdvice: unavailable(),
  labImageExtraction: unavailable(),
  monitorOcr: unavailable(),
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

let cached: ClinicalAiCapabilities | null = null
let cachedAt = 0
let loading: Promise<ClinicalAiCapabilities> | null = null
let authenticationCached: AuthenticationCapabilities | null = null
let authenticationLoading: Promise<AuthenticationCapabilities> | null = null
const CAPABILITY_REFRESH_MS = 15_000

export function loadClinicalAiCapabilities(force = false): Promise<ClinicalAiCapabilities> {
  if (!force && cached && Date.now() - cachedAt < CAPABILITY_REFRESH_MS) {
    return Promise.resolve(cached)
  }
  if (loading) return loading
  loading = apiFetch("/api/capabilities", { method: "GET" })
    .then(async response => {
      if (!response.ok) return SAFE_CLINICAL_AI_CAPABILITIES
      return parseClinicalAiCapabilities(await response.json().catch(() => null))
    })
    .catch(() => SAFE_CLINICAL_AI_CAPABILITIES)
    .then(result => {
      cached = result
      cachedAt = Date.now()
      return result
    })
    .finally(() => { loading = null })
  return loading
}

export function clearClinicalAiCapabilitiesCache(): void {
  cached = null
  cachedAt = 0
  loading = null
  authenticationCached = null
  authenticationLoading = null
}

export function loadAuthenticationCapabilities(force = false): Promise<AuthenticationCapabilities> {
  if (!force && authenticationCached) return Promise.resolve(authenticationCached)
  if (authenticationLoading) return authenticationLoading
  authenticationLoading = apiFetch("/api/capabilities", { method: "GET" })
    .then(async response => response.ok
      ? parseAuthenticationCapabilities(await response.json().catch(() => null))
      : SAFE_AUTHENTICATION_CAPABILITIES)
    .catch(() => SAFE_AUTHENTICATION_CAPABILITIES)
    .then(result => {
      authenticationCached = result
      return result
    })
    .finally(() => { authenticationLoading = null })
  return authenticationLoading
}

export function useAuthenticationCapabilities(): AuthenticationCapabilities {
  const [capabilities, setCapabilities] = useState(
    authenticationCached ?? SAFE_AUTHENTICATION_CAPABILITIES,
  )
  useEffect(() => {
    let active = true
    const refresh = (force = false) => void loadAuthenticationCapabilities(force).then(value => {
      if (active) setCapabilities(value)
    })
    refresh()
    const interval = setInterval(() => refresh(true), CAPABILITY_REFRESH_MS)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])
  return capabilities
}

export function useClinicalAiCapabilities(): ClinicalAiCapabilities {
  const [capabilities, setCapabilities] = useState(
    cached ?? SAFE_CLINICAL_AI_CAPABILITIES,
  )
  useEffect(() => {
    let active = true
    const refresh = (force = false) => void loadClinicalAiCapabilities(force).then(value => {
      if (active) setCapabilities(value)
    })
    refresh()
    const interval = setInterval(() => refresh(true), CAPABILITY_REFRESH_MS)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])
  return capabilities
}
