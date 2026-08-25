"use client"

import { useEffect, useState } from "react"

export type LoginIdentifier = "EMAIL" | "USERNAME"
export type PasswordRecovery = "EMAIL" | "ADMINISTRATOR"

export type AuthenticationCapability = {
  loginIdentifier: LoginIdentifier
  selfRegistration: boolean
  passwordRecovery: PasswordRecovery
}

export type AuthenticationCapabilityState = {
  capability: AuthenticationCapability | null
  loading: boolean
}

/**
 * Older Cloud Demo APIs do not report `loginIdentifier`. Retaining its current
 * email workflow is the only backwards-compatible default until API 1.2 lands.
 */
export const LEGACY_PUBLIC_AUTHENTICATION_CAPABILITY: AuthenticationCapability = {
  loginIdentifier: "EMAIL",
  selfRegistration: true,
  passwordRecovery: "EMAIL",
}

export function parseAuthenticationCapability(value: unknown): AuthenticationCapability | null {
  const authentication = value && typeof value === "object"
    ? (value as { authentication?: unknown }).authentication
    : null
  if (!authentication || typeof authentication !== "object") {
    return null
  }

  const candidate = authentication as {
    loginIdentifier?: unknown
    selfRegistration?: unknown
    passwordRecovery?: unknown
  }

  // USERNAME is an explicit deployment boundary. Only the complete released
  // Hospital tuple is trusted; partial, unavailable, or contradictory policy
  // mounts no form and never falls back to an email-shaped request.
  if (candidate.loginIdentifier === "USERNAME") {
    return candidate.selfRegistration === false
      && candidate.passwordRecovery === "ADMINISTRATOR"
      ? {
          loginIdentifier: "USERNAME",
          selfRegistration: false,
          passwordRecovery: "ADMINISTRATOR",
        }
      : null
  }

  // A missing identifier is the released pre-1.2 Cloud Demo contract. The old
  // API can also report UNAVAILABLE for recovery; hide that link rather than
  // presenting a request that is guaranteed to fail.
  if (candidate.loginIdentifier === undefined || candidate.loginIdentifier === "EMAIL") {
    if (typeof candidate.selfRegistration !== "boolean") return null
    if (
      candidate.passwordRecovery !== "EMAIL"
      && candidate.passwordRecovery !== "ADMINISTRATOR"
      && candidate.passwordRecovery !== "UNAVAILABLE"
    ) return null
    return {
      loginIdentifier: "EMAIL",
      selfRegistration: candidate.selfRegistration,
      passwordRecovery: candidate.passwordRecovery === "ADMINISTRATOR"
        || candidate.passwordRecovery === "UNAVAILABLE"
        ? "ADMINISTRATOR"
        : "EMAIL",
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
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
    .then(async response => response.ok
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

export function useAuthenticationCapability(): AuthenticationCapabilityState {
  const [state, setState] = useState<AuthenticationCapabilityState>(() => ({
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
