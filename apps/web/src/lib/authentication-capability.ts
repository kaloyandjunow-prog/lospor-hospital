"use client"

import { useEffect, useState } from "react"

export type AuthenticationCapability = {
  loginIdentifier: "EMAIL" | "USERNAME"
  selfRegistration: boolean
  passwordRecovery: "EMAIL" | "ADMINISTRATOR"
}

export function parseAuthenticationCapability(value: unknown): AuthenticationCapability | null {
  const authentication = value && typeof value === "object"
    ? (value as { authentication?: unknown }).authentication
    : null
  if (!authentication || typeof authentication !== "object" || Array.isArray(authentication)) {
    return null
  }
  const candidate = authentication as Record<string, unknown>
  if (candidate.loginIdentifier === "USERNAME") {
    return candidate.selfRegistration === false
      && candidate.passwordRecovery === "ADMINISTRATOR"
      ? { loginIdentifier: "USERNAME", selfRegistration: false, passwordRecovery: "ADMINISTRATOR" }
      : null
  }
  if (candidate.loginIdentifier === undefined || candidate.loginIdentifier === "EMAIL") {
    if (typeof candidate.selfRegistration !== "boolean") return null
    if (candidate.passwordRecovery !== "EMAIL"
      && candidate.passwordRecovery !== "ADMINISTRATOR"
      && candidate.passwordRecovery !== "UNAVAILABLE") return null
    return {
      loginIdentifier: "EMAIL",
      selfRegistration: candidate.selfRegistration,
      passwordRecovery: candidate.passwordRecovery === "EMAIL" ? "EMAIL" : "ADMINISTRATOR",
    }
  }
  return null
}

let cached: AuthenticationCapability | null | undefined
let loading: Promise<AuthenticationCapability | null> | null = null

export function loadAuthenticationCapability(): Promise<AuthenticationCapability | null> {
  if (cached !== undefined) return Promise.resolve(cached)
  if (loading) return loading
  loading = fetch("/api/capabilities", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  }).then(async response => response.ok
    ? parseAuthenticationCapability(await response.json().catch(() => null))
    : null)
    .catch(() => null)
    .then(result => {
      cached = result
      return result
    })
    .finally(() => { loading = null })
  return loading
}

export function clearAuthenticationCapabilityCache(): void {
  cached = undefined
  loading = null
}

export function useAuthenticationCapability() {
  const [state, setState] = useState(() => ({
    capability: cached ?? null,
    loading: cached === undefined,
  }))
  useEffect(() => {
    let active = true
    void loadAuthenticationCapability().then(capability => {
      if (active) setState({ capability, loading: false })
    })
    return () => { active = false }
  }, [])
  return state
}
