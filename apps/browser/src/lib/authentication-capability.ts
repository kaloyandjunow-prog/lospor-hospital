"use client"

import { useEffect, useState } from "react"

export type LoginIdentifier = "EMAIL" | "USERNAME"

export type AuthenticationCapability = {
  loginIdentifier: LoginIdentifier
}

export type AuthenticationCapabilityState = {
  capability: AuthenticationCapability | null
  loading: boolean
}

function parseAuthenticationCapability(value: unknown): AuthenticationCapability | null {
  const authentication = value && typeof value === "object"
    ? (value as { authentication?: unknown }).authentication
    : null
  if (!authentication || typeof authentication !== "object") return null
  const identifier = (authentication as { loginIdentifier?: unknown }).loginIdentifier
  return identifier === "USERNAME" || identifier === "EMAIL"
    ? { loginIdentifier: identifier }
    : null
}

// Module-level, not component state: every mount of the login form during one
// page load should ask the deployment once, not once per render.
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
    .then(async response => (response.ok
      ? parseAuthenticationCapability(await response.json().catch(() => null))
      : null))
    .catch(() => null)
    .then(result => {
      cached = result
      return result
    })
    .finally(() => { loading = null })
  return loading
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
