"use client"

import { useEffect, useState } from "react"

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

const unavailable = (): RuntimeCapability => ({
  enabled: false,
  reason: "PROVIDER_NOT_CONFIGURED",
})

export const SAFE_CLINICAL_AI_CAPABILITIES: ClinicalAiCapabilities = {
  clinicalAdvice: unavailable(),
  labImageExtraction: unavailable(),
  monitorOcr: unavailable(),
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
const CAPABILITY_REFRESH_MS = 15_000

export function loadClinicalAiCapabilities(force = false): Promise<ClinicalAiCapabilities> {
  if (!force && cached && Date.now() - cachedAt < CAPABILITY_REFRESH_MS) {
    return Promise.resolve(cached)
  }
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
    const interval = window.setInterval(() => refresh(true), CAPABILITY_REFRESH_MS)
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
  return capabilities
}
