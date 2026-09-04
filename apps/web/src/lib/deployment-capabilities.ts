"use client"

import { useEffect, useState } from "react"
import { LOSPOR_WEB_CLIENT_VERSION } from "@/lib/client-version"

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

export type ClinicalAiUnavailableMessageKey =
  | "deploymentCapabilities.externalAiDisabled"
  | "deploymentCapabilities.externalAiUnavailable"

export type PediatricModeCapabilityReason =
  | "ENABLED"
  | "DISABLED_BY_DEPLOYMENT"
  | "CLIENT_UPDATE_REQUIRED"
  | "CAPABILITY_UNAVAILABLE"

export type PediatricModeCapability = {
  enabled: boolean
  reason: PediatricModeCapabilityReason
  productionReady: boolean
  rulesetVersion: string | null
  minimumClientVersion: string | null
  reviewedDoseProfilesRequired: boolean
}

export type PediatricCapabilityMessageKey =
  | "newSelectionDisabled"
  | "newSelectionUnavailable"
  | "newSelectionClientUpdate"
  | "existingRecordReadOnlyDisabled"
  | "existingRecordReadOnlyUnavailable"
  | "existingRecordReadOnlyClientUpdate"

const unavailable = (): RuntimeCapability => ({
  enabled: false,
  reason: "PROVIDER_NOT_CONFIGURED",
})

export const SAFE_CLINICAL_AI_CAPABILITIES: ClinicalAiCapabilities = {
  clinicalAdvice: unavailable(),
  labImageExtraction: unavailable(),
  monitorOcr: unavailable(),
}

export const SAFE_PEDIATRIC_MODE_CAPABILITY: PediatricModeCapability = {
  enabled: false,
  reason: "CAPABILITY_UNAVAILABLE",
  productionReady: false,
  rulesetVersion: null,
  minimumClientVersion: null,
  reviewedDoseProfilesRequired: false,
}

export function capabilityMessageKey(
  reason: CapabilityReason,
): ClinicalAiUnavailableMessageKey {
  return reason === "DISABLED_BY_DEPLOYMENT"
    ? "deploymentCapabilities.externalAiDisabled"
    : "deploymentCapabilities.externalAiUnavailable"
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

function versionParts(value: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function isVersionAtLeast(actualValue: string, requiredValue: string): boolean {
  const actual = versionParts(actualValue)
  const required = versionParts(requiredValue)
  if (!actual || !required) return false
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] > required[index]) return true
    if (actual[index] < required[index]) return false
  }
  return true
}

/**
 * Pediatric writes are safe only when the API returns the complete reviewed
 * capability contract. A partial, contradictory, or future contract remains
 * readable but cannot open a new Pediatric write path.
 */
export function parsePediatricModeCapability(value: unknown): PediatricModeCapability {
  const feature = value && typeof value === "object"
    ? (value as { features?: { pediatricMode?: unknown } }).features?.pediatricMode
    : null
  if (!feature || typeof feature !== "object") {
    return SAFE_PEDIATRIC_MODE_CAPABILITY
  }

  const candidate = feature as {
    enabled?: unknown
    productionReady?: unknown
    rulesetVersion?: unknown
    minimumClientVersion?: unknown
    reviewedDoseProfilesRequired?: unknown
  }
  const hasExactShape = typeof candidate.enabled === "boolean"
    && typeof candidate.productionReady === "boolean"
    && typeof candidate.rulesetVersion === "string"
    && candidate.rulesetVersion.trim().length > 0
    && typeof candidate.minimumClientVersion === "string"
    && versionParts(candidate.minimumClientVersion) !== null
    && candidate.reviewedDoseProfilesRequired === true
  if (!hasExactShape) return SAFE_PEDIATRIC_MODE_CAPABILITY

  const metadata = {
    productionReady: candidate.productionReady as boolean,
    rulesetVersion: (candidate.rulesetVersion as string).trim(),
    minimumClientVersion: (candidate.minimumClientVersion as string).trim(),
    reviewedDoseProfilesRequired: true,
  }
  if (candidate.productionReady !== true) {
    return {
      enabled: false,
      reason: "CAPABILITY_UNAVAILABLE",
      ...metadata,
    }
  }
  if (candidate.enabled === false) {
    return {
      enabled: false,
      reason: "DISABLED_BY_DEPLOYMENT",
      ...metadata,
    }
  }
  if (!isVersionAtLeast(
    LOSPOR_WEB_CLIENT_VERSION,
    candidate.minimumClientVersion as string,
  )) {
    return {
      enabled: false,
      reason: "CLIENT_UPDATE_REQUIRED",
      ...metadata,
    }
  }
  return {
    enabled: true,
    reason: "ENABLED",
    ...metadata,
  }
}

export function pediatricCapabilityMessageKey(
  capability: PediatricModeCapability,
  existingRecord: boolean,
): PediatricCapabilityMessageKey {
  if (existingRecord) {
    if (capability.reason === "DISABLED_BY_DEPLOYMENT") {
      return "existingRecordReadOnlyDisabled"
    }
    if (capability.reason === "CLIENT_UPDATE_REQUIRED") {
      return "existingRecordReadOnlyClientUpdate"
    }
    return "existingRecordReadOnlyUnavailable"
  }
  if (capability.reason === "DISABLED_BY_DEPLOYMENT") {
    return "newSelectionDisabled"
  }
  if (capability.reason === "CLIENT_UPDATE_REQUIRED") {
    return "newSelectionClientUpdate"
  }
  return "newSelectionUnavailable"
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
let loading: Promise<ClinicalAiCapabilities> | null = null

export function loadClinicalAiCapabilities(): Promise<ClinicalAiCapabilities> {
  if (cached) return Promise.resolve(cached)
  if (loading) return loading
  loading = fetch("/api/capabilities", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
    .then(async response => {
      if (!response.ok) return SAFE_CLINICAL_AI_CAPABILITIES
      return parseClinicalAiCapabilities(await response.json().catch(() => null))
    })
    .catch(() => SAFE_CLINICAL_AI_CAPABILITIES)
    .then(result => {
      cached = result
      return result
    })
    .finally(() => { loading = null })
  return loading
}

export function clearClinicalAiCapabilitiesCache(): void {
  cached = null
  loading = null
}

export function useClinicalAiCapabilities(): ClinicalAiCapabilities {
  const [capabilities, setCapabilities] = useState(
    cached ?? SAFE_CLINICAL_AI_CAPABILITIES,
  )
  useEffect(() => {
    let active = true
    void loadClinicalAiCapabilities().then(value => {
      if (active) setCapabilities(value)
    })
    return () => { active = false }
  }, [])
  return capabilities
}

let cachedPediatricMode: PediatricModeCapability | null = null
let cachedPediatricModeAt = 0
let loadingPediatricMode: Promise<PediatricModeCapability> | null = null
const PEDIATRIC_CAPABILITY_REFRESH_MS = 15_000

export function loadPediatricModeCapability(
  force = false,
): Promise<PediatricModeCapability> {
  if (
    !force
    && cachedPediatricMode
    && Date.now() - cachedPediatricModeAt < PEDIATRIC_CAPABILITY_REFRESH_MS
  ) return Promise.resolve(cachedPediatricMode)
  if (loadingPediatricMode) return loadingPediatricMode
  loadingPediatricMode = fetch("/api/capabilities", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
    .then(async response => response.ok
      ? parsePediatricModeCapability(await response.json().catch(() => null))
      : SAFE_PEDIATRIC_MODE_CAPABILITY)
    .catch(() => SAFE_PEDIATRIC_MODE_CAPABILITY)
    .then(result => {
      cachedPediatricMode = result
      cachedPediatricModeAt = Date.now()
      return result
    })
    .finally(() => { loadingPediatricMode = null })
  return loadingPediatricMode
}

export function clearPediatricModeCapabilityCache(): void {
  cachedPediatricMode = null
  cachedPediatricModeAt = 0
  loadingPediatricMode = null
}

export function usePediatricModeCapability(): PediatricModeCapability {
  const [capability, setCapability] = useState(
    cachedPediatricMode ?? SAFE_PEDIATRIC_MODE_CAPABILITY,
  )
  useEffect(() => {
    let active = true
    const refresh = (force = false) => void loadPediatricModeCapability(force).then(value => {
      if (active) setCapability(value)
    })
    refresh()
    const interval = window.setInterval(
      () => refresh(true),
      PEDIATRIC_CAPABILITY_REFRESH_MS,
    )
    const onFocus = () => refresh(true)
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh(true)
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])
  return capability
}

/**
 * Whether this deployment can ask a hospital system about a patient.
 *
 * The clients had no way to find this out, so the review screen was built,
 * tested and rendered by nothing: there was no answer to "should this control
 * exist here". Cloud reports it disabled by deployment, which is true — there
 * is no hospital system on the other side.
 *
 * `egnPermitted` travels with it because the two decide the same control
 * together: which identifier a patient may be looked up by. The server enforces
 * the policy regardless; this only stops the client offering an option that
 * would be refused.
 */
export type EhrImportCapability = {
  enabled: boolean
  reason: CapabilityReason
  transport: "FOLDER" | "FHIR" | "HL7V2" | null
  egnPermitted: boolean
}

/**
 * Off until the server says otherwise.
 *
 * The safe default matters more here than for most capabilities: showing an
 * import control on a deployment with nothing behind it offers a clinician
 * something that can only fail.
 */
export const SAFE_EHR_IMPORT_CAPABILITY: EhrImportCapability = {
  enabled: false,
  reason: "PROVIDER_NOT_CONFIGURED",
  transport: null,
  egnPermitted: false,
}

export function parseEhrImportCapability(value: unknown): EhrImportCapability {
  const raw = value && typeof value === "object"
    ? (value as { features?: { ehrImport?: unknown } }).features?.ehrImport
    : null
  if (!raw || typeof raw !== "object") return { ...SAFE_EHR_IMPORT_CAPABILITY }
  const source = raw as Record<string, unknown>
  const transport = source.transport
  return {
    // Reuses the shared normaliser, so an unrecognised reason falls back to
    // unavailable rather than being trusted through.
    ...runtimeCapability(source),
    transport: transport === "FOLDER" || transport === "FHIR" || transport === "HL7V2"
      ? transport
      : null,
    egnPermitted: source.egnPermitted === true,
  }
}

let cachedEhrImport: EhrImportCapability | null = null
let loadingEhrImport: Promise<EhrImportCapability> | null = null

export function loadEhrImportCapability(): Promise<EhrImportCapability> {
  if (cachedEhrImport) return Promise.resolve(cachedEhrImport)
  if (loadingEhrImport) return loadingEhrImport
  loadingEhrImport = fetch("/api/capabilities", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
    .then(async response => {
      if (!response.ok) return SAFE_EHR_IMPORT_CAPABILITY
      return parseEhrImportCapability(await response.json().catch(() => null))
    })
    .catch(() => SAFE_EHR_IMPORT_CAPABILITY)
    .then(result => {
      cachedEhrImport = result
      return result
    })
    .finally(() => { loadingEhrImport = null })
  return loadingEhrImport
}

export function clearEhrImportCapabilityCache(): void {
  cachedEhrImport = null
  loadingEhrImport = null
}

export function useEhrImportCapability(): EhrImportCapability {
  const [capability, setCapability] = useState(cachedEhrImport ?? SAFE_EHR_IMPORT_CAPABILITY)
  useEffect(() => {
    let active = true
    void loadEhrImportCapability().then(value => {
      if (active) setCapability(value)
    })
    return () => { active = false }
  }, [])
  return capability
}
