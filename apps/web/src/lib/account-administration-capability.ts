"use client"

import { useEffect, useState } from "react"
import type { RuntimeCapability } from "@/lib/deployment-capabilities"

export const SAFE_ACCOUNT_ADMINISTRATION_CAPABILITY: RuntimeCapability = {
  enabled: false,
  reason: "DISABLED_BY_DEPLOYMENT",
}

export function parseAccountAdministrationCapability(value: unknown): RuntimeCapability {
  const feature = value && typeof value === "object"
    ? (value as { features?: { accountAdministration?: unknown } }).features?.accountAdministration
    : null
  if (!feature || typeof feature !== "object") {
    return SAFE_ACCOUNT_ADMINISTRATION_CAPABILITY
  }
  const candidate = feature as { enabled?: unknown; reason?: unknown }
  if (candidate.enabled === true && candidate.reason === "ENABLED") {
    return { enabled: true, reason: "ENABLED" }
  }
  return SAFE_ACCOUNT_ADMINISTRATION_CAPABILITY
}

let cached: RuntimeCapability | null = null
let loading: Promise<RuntimeCapability> | null = null

export function loadAccountAdministrationCapability(): Promise<RuntimeCapability> {
  if (cached) return Promise.resolve(cached)
  if (loading) return loading
  loading = fetch("/api/capabilities", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
    .then(async response => response.ok
      ? parseAccountAdministrationCapability(await response.json().catch(() => null))
      : SAFE_ACCOUNT_ADMINISTRATION_CAPABILITY)
    .catch(() => SAFE_ACCOUNT_ADMINISTRATION_CAPABILITY)
    .then(result => {
      cached = result
      return result
    })
    .finally(() => { loading = null })
  return loading
}

export function clearAccountAdministrationCapabilityCache() {
  cached = null
  loading = null
}

export function useAccountAdministrationCapability(): RuntimeCapability {
  const [capability, setCapability] = useState(
    cached ?? SAFE_ACCOUNT_ADMINISTRATION_CAPABILITY,
  )
  useEffect(() => {
    let active = true
    void loadAccountAdministrationCapability().then(value => {
      if (active) setCapability(value)
    })
    return () => { active = false }
  }, [])
  return capability
}
