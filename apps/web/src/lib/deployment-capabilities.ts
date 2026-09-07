"use client"

import { useEffect, useState } from "react"
import {
  parseClinicalAiCapabilities,
  parsePediatricModeCapability,
  safeClinicalAiCapabilities,
  safePediatricModeCapability,
  type CapabilityReason,
  type ClinicalAiCapabilities,
  type PediatricModeCapability,
  type RuntimeCapability,
} from "@lospor/core/deployment-capabilities"
import { LOSPOR_WEB_CLIENT_VERSION } from "@/lib/client-version"

/**
 * Reading the deployment's declaration is shared logic and lives in core.
 * What is left here is this app's half of it: the same-origin request, the
 * caches the components read, and a refresh when the tab comes back.
 */

export type {
  AuthenticationCapabilities,
  CapabilityReason,
  ClinicalAiCapabilities,
  DeploymentCapabilities,
  PediatricModeCapability,
  PediatricModeCapabilityReason,
  RuntimeCapability,
} from "@lospor/core/deployment-capabilities"

export type ClinicalAiUnavailableMessageKey =
  | "deploymentCapabilities.externalAiDisabled"
  | "deploymentCapabilities.externalAiUnavailable"

export type PediatricCapabilityMessageKey =
  | "newSelectionDisabled"
  | "newSelectionUnavailable"
  | "newSelectionClientUpdate"
  | "existingRecordReadOnlyDisabled"
  | "existingRecordReadOnlyUnavailable"
  | "existingRecordReadOnlyClientUpdate"

export function capabilityMessageKey(
  reason: CapabilityReason,
): ClinicalAiUnavailableMessageKey {
  return reason === "DISABLED_BY_DEPLOYMENT"
    ? "deploymentCapabilities.externalAiDisabled"
    : "deploymentCapabilities.externalAiUnavailable"
}

/**
 * An unreviewed ruleset and one this client cannot parse both read as
 * unavailable here: neither is something the clinician can act on at the
 * bedside, and both send them to the same person.
 */
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

function requestCapabilities(): Promise<Response> {
  return fetch("/api/capabilities", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
}

/**
 * How stale a cached capability answer may be before a mounted hook asks
 * again. Shared by AI and pediatric mode so an administrator's change in
 * Status reaches a mounted screen on the same schedule regardless of which
 * capability it touched -- AI capability used to load once on mount and never
 * refresh, so disabling it in Status took effect on the phone within 15
 * seconds and on an open web tab only at the next reload.
 */
const CAPABILITY_REFRESH_MS = 15_000

let cached: ClinicalAiCapabilities | null = null
let cachedAt = 0
let loading: Promise<ClinicalAiCapabilities> | null = null

export function loadClinicalAiCapabilities(force = false): Promise<ClinicalAiCapabilities> {
  if (!force && cached && Date.now() - cachedAt < CAPABILITY_REFRESH_MS) {
    return Promise.resolve(cached)
  }
  if (loading) return loading
  loading = requestCapabilities()
    .then(async response => {
      if (!response.ok) return safeClinicalAiCapabilities()
      return parseClinicalAiCapabilities(await response.json().catch(() => null))
    })
    .catch(() => safeClinicalAiCapabilities())
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
    () => cached ?? safeClinicalAiCapabilities(),
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

let cachedPediatricMode: PediatricModeCapability | null = null
let cachedPediatricModeAt = 0
let loadingPediatricMode: Promise<PediatricModeCapability> | null = null

export function loadPediatricModeCapability(
  force = false,
): Promise<PediatricModeCapability> {
  if (
    !force
    && cachedPediatricMode
    && Date.now() - cachedPediatricModeAt < CAPABILITY_REFRESH_MS
  ) return Promise.resolve(cachedPediatricMode)
  if (loadingPediatricMode) return loadingPediatricMode
  loadingPediatricMode = requestCapabilities()
    .then(async response => response.ok
      ? parsePediatricModeCapability(
          await response.json().catch(() => null),
          LOSPOR_WEB_CLIENT_VERSION,
        )
      : safePediatricModeCapability())
    .catch(() => safePediatricModeCapability())
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
    () => cachedPediatricMode ?? safePediatricModeCapability(),
  )
  useEffect(() => {
    let active = true
    const refresh = (force = false) => void loadPediatricModeCapability(force).then(value => {
      if (active) setCapability(value)
    })
    refresh()
    const interval = window.setInterval(
      () => refresh(true),
      CAPABILITY_REFRESH_MS,
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

/**
 * Read one runtime capability, failing closed.
 *
 * Core keeps its own copy of this private, and the EHR import capability below
 * is appliance-only, so it lives here. Anything that is not an explicit
 * `enabled: true` with `reason: "ENABLED"` reads as unavailable -- an
 * unrecognised reason must never be trusted through as a working feature.
 */
function runtimeCapability(value: unknown): RuntimeCapability {
  if (!value || typeof value !== "object") {
    return { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" }
  }
  const candidate = value as { enabled?: unknown; reason?: unknown }
  if (candidate.enabled === true && candidate.reason === "ENABLED") {
    return { enabled: true, reason: "ENABLED" }
  }
  if (candidate.reason === "DISABLED_BY_DEPLOYMENT") {
    return { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" }
  }
  return { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" }
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
