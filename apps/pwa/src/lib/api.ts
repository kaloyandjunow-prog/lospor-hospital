import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"
import type { AppLanguage } from "@/i18n/locale"
import type { LegalAcceptanceReference } from "@/lib/legal-documents"
import { LOSPOR_MOBILE_CLIENT_VERSION } from "./client-version"
import {
  loginRequestIdentifier,
  type LoginCredential,
} from "./login-identifier"
import {
  parseAdministratorMfaChallenge,
  parseAdministratorMfaCompletion,
  type AdministratorMfaChallenge,
  type AdministratorMfaCompletion,
  type LoginResult,
} from "./administrator-mfa"

const IS_WEB_SESSION = Platform.OS === "web"

// The browser build is deliberately same-origin. Hospital Caddy and the public
// Vercel route proxy `/v1` to the API, allowing the credential to remain in an
// HttpOnly cookie. Native builds still call the configured API origin and keep
// a bearer token in the operating-system secure store.
export const API_BASE = IS_WEB_SESSION
  ? ""
  : (process.env.EXPO_PUBLIC_API_BASE ?? "https://api.lospor.org").replace(/\/$/, "")

export function apiPath(path: string): string {
  if (path === "/api") return "/v1"
  if (path.startsWith("/api/")) return `/v1/${path.slice(5)}`
  return path
}

export function apiUrl(path: string): string {
  return `${API_BASE}${apiPath(path)}`
}

const TOKEN_KEY = "lospor_access_token"
// `lospor_last_ok_request` / `lospor_last_api_error` were SecureStore keys until
// 8.5.0. They are now in-memory (see below); any values left behind on an
// upgraded device are inert and not worth an extra Keystore call to delete.
const authExpiredListeners = new Set<() => void>()

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public serverVersion?: Record<string, unknown>,
    public details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export type ApiRequestInit = RequestInit & {
  timeoutMs?: number
}

/**
 * The access token, cached in memory after the first read.
 *
 * SecureStore is the durable home for it — it must survive a restart — but
 * every request built a header by reading it back out, which is an Android
 * Keystore decryption per API call, on top of the two Keystore writes that used
 * to follow each response. Reading a value we just wrote ourselves, thousands of
 * times a case, is the kind of cost that only shows up on the device: on web
 * SecureStore is a `localStorage` shim, which is why the PWA never felt it.
 *
 * Every writer below keeps the cache honest, so it cannot go stale behind a
 * sign-in, sign-out or expiry.
 */
let cachedToken: string | null = null
let tokenLoaded = false

export async function getToken(): Promise<string | null> {
  if (IS_WEB_SESSION) {
    // Remove an upgraded PWA's legacy JS-readable bearer token. Cookie session
    // state is checked through the API and is never copied back into JS storage.
    if (!tokenLoaded) {
      try { await SecureStore.deleteItemAsync(TOKEN_KEY) } catch {}
    }
    cachedToken = null
    tokenLoaded = true
    return null
  }
  if (!tokenLoaded) {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY)
    tokenLoaded = true
  }
  return cachedToken
}

export async function setToken(token: string): Promise<void> {
  if (IS_WEB_SESSION) {
    throw new Error("Browser bearer-token storage is disabled")
  }
  cachedToken = token
  tokenLoaded = true
  await SecureStore.setItemAsync(TOKEN_KEY, token)
}

export async function clearToken(): Promise<void> {
  cachedToken = null
  tokenLoaded = true
  await SecureStore.deleteItemAsync(TOKEN_KEY)
}

export function onAuthExpired(listener: () => void): () => void {
  authExpiredListeners.add(listener)
  return () => authExpiredListeners.delete(listener)
}

// Debounce gate: if multiple concurrent requests hit 401 simultaneously only
// one auth-expired event fires. Resets after 2 seconds.
let authExpiredFiredAt = 0
async function handleUnauthorized() {
  const now = Date.now()
  if (now - authExpiredFiredAt < 2000) return
  authExpiredFiredAt = now
  await clearToken()
  authExpiredListeners.forEach((listener) => listener())
}

/**
 * Connection diagnostics for the settings screen, held in memory.
 *
 * These used to be written to SecureStore on *every* response — two Android
 * Keystore writes per API call, on the path of every poll, every autosave and
 * every event recorded during a case. Keystore writes are encrypted operations,
 * not variable assignments. On web `SecureStore` is shimmed to `localStorage`
 * and costs nothing, which is exactly why this never appeared in the PWA while
 * the same build crawled on the phone.
 *
 * They are read once when a screen opens, and nothing clinical depends on them,
 * so losing them on restart costs nothing worth an encrypted write per request.
 */
let lastOkRequest: string | null = null
let lastApiError: string | null = null

export function getLastOkRequest(): Promise<string | null> {
  return Promise.resolve(lastOkRequest)
}

export function getLastApiError(): Promise<string | null> {
  return Promise.resolve(lastApiError)
}

export function decodeTokenPayload(token: string | null): Record<string, unknown> | null {
  if (!token) return null
  try {
    const payload = token.split(".")[1]
    const padded = payload.padEnd(payload.length + (4 - payload.length % 4) % 4, "=")
    return JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")))
  } catch {
    return null
  }
}

export function isTokenExpired(token: string | null): boolean {
  const payload = decodeTokenPayload(token)
  if (!payload?.exp) return false
  return Date.now() >= Number(payload.exp) * 1000
}

async function buildHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await getToken()
  return {
    "Content-Type": "application/json",
    "X-LOSPOR-Client": "mobile",
    "X-LOSPOR-Client-Version": LOSPOR_MOBILE_CLIENT_VERSION,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

/**
 * Nothing may wait on the network forever.
 *
 * `fetch` has no timeout of its own, so a request that never answers used to
 * hang indefinitely. One of those inside the background sync poll was enough to
 * stop the poll settling, which stopped the poller rescheduling, which left
 * queued clinical work sitting until the clinician pressed sync by hand.
 *
 * Callers that need a tighter bound still pass their own `timeoutMs` — autosave
 * uses 3 s so it can fall back to the durable queue quickly. This is the outer
 * limit for everything else.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000

export async function apiFetch(path: string, init?: ApiRequestInit): Promise<Response> {
  const headers = await buildHeaders(init?.headers as Record<string, string>)
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...requestInit } = init ?? {}
  const timeoutController = timeoutMs && timeoutMs > 0 ? new AbortController() : null
  const relayAbort = () => timeoutController?.abort()
  if (timeoutController && requestInit.signal) {
    if (requestInit.signal.aborted) relayAbort()
    else requestInit.signal.addEventListener("abort", relayAbort, { once: true })
  }
  const timeout = timeoutController
    ? setTimeout(() => timeoutController.abort(), timeoutMs)
    : null
  try {
    const res = await fetch(apiUrl(path), {
      ...requestInit,
      ...(IS_WEB_SESSION && requestInit.credentials === undefined
        ? { credentials: "same-origin" as const }
        : {}),
      headers,
      signal: timeoutController?.signal ?? requestInit.signal,
    })
    if (res.ok) {
      lastOkRequest = new Date().toISOString()
    } else {
      lastApiError = `${res.status} ${path}`
      if (res.status === 401) await handleUnauthorized()
    }
    return res
  } catch (err) {
    lastApiError = `Network error ${path}`
    throw err
  } finally {
    if (timeout !== null) clearTimeout(timeout)
    requestInit.signal?.removeEventListener("abort", relayAbort)
  }
}

export async function apiJson<T>(path: string, init?: ApiRequestInit): Promise<T> {
  let res: Response
  try {
    res = await apiFetch(path, init)
  } catch {
    throw new ApiError(
      API_BASE ? `Cannot reach server at ${API_BASE}.` : "Cannot reach the application server.",
      0,
      "NETWORK",
    )
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const fallback =
      res.status === 401 ? "Session expired. Please sign in again."
      : res.status === 403 ? "You do not have access to this item."
      : res.status === 404 ? "This item was not found."
      : `Request failed (${res.status}).`
    throw new ApiError(body.error ?? fallback, res.status, body.code, body.serverVersion, body)
  }

  return res.json()
}

export async function hasAuthenticatedSession(): Promise<boolean> {
  if (!IS_WEB_SESSION) {
    const token = await getToken()
    return Boolean(token && !isTokenExpired(token))
  }
  try {
    const response = await fetch(apiUrl("/api/auth/session"), {
      method: "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "X-LOSPOR-Client": "pwa",
        "X-LOSPOR-Client-Version": LOSPOR_MOBILE_CLIENT_VERSION,
      },
    })
    if (!response.ok) return false

    // A reverse-proxy or development-server fallback can return the PWA HTML
    // with HTTP 200 for an unknown /v1 route. Treat authentication as proven
    // only when the API returns the same minimal user identity required after
    // sign-in; status alone is not an authentication assertion.
    const body = await response.json().catch(() => null)
    return Boolean(body?.user?.id)
  } catch {
    // A reloaded offline PWA cannot prove that its HttpOnly session is still
    // valid. Fail closed without deleting drafts; an already-open authenticated
    // app remains usable until it receives an authoritative 401.
    return false
  }
}

// Login — Web/PWA receives an HttpOnly cookie; native stores a bearer token.
// The discriminated credential prevents a username deployment from silently
// posting an email field (or vice versa).
export async function login(
  credential: LoginCredential,
  password: string,
  locale: AppLanguage,
): Promise<LoginResult> {
  // A login attempt always starts from a token-free local state. This avoids a
  // failed sign-in leaving a previous clinician's bearer token on a shared
  // device if the UI was reached after an interrupted expiry transition.
  await clearToken()
  let res: Response
  try {
    res = await fetch(apiUrl(IS_WEB_SESSION ? "/api/auth/session" : "/api/auth/token"), {
      method: "POST",
      ...(IS_WEB_SESSION ? { credentials: "same-origin" as const } : {}),
      headers: {
        "Content-Type": "application/json",
        ...(IS_WEB_SESSION ? {
          "X-LOSPOR-Client": "pwa",
          "X-LOSPOR-Client-Version": LOSPOR_MOBILE_CLIENT_VERSION,
        } : {}),
      },
      body: JSON.stringify({
        ...loginRequestIdentifier(credential),
        password,
        locale,
      }),
    })
  } catch {
    throw new ApiError("Sign-in service is unreachable.", 0, "NETWORK")
  }
  const body = await res.json().catch(() => ({}))
  if (res.status === 202) {
    const challenge = parseAdministratorMfaChallenge(body)
    if (!challenge) {
      throw new ApiError("The server returned an invalid MFA challenge.", 502, "AUTH_RESPONSE_INVALID")
    }
    return { kind: "mfa", challenge }
  }
  if (!res.ok) {
    throw new ApiError(
      body.error ?? "Invalid credentials, or the account is not yet approved.",
      res.status,
      body.code,
      body.serverVersion,
      body,
    )
  }
  if (IS_WEB_SESSION) {
    if (!body?.user?.id) {
      throw new ApiError("The server returned an invalid sign-in response.", 502, "AUTH_RESPONSE_INVALID")
    }
    return { kind: "authenticated" }
  }
  const { access_token } = body
  if (typeof access_token !== "string" || !access_token) {
    throw new ApiError("The server returned an invalid sign-in response.", 502, "AUTH_RESPONSE_INVALID")
  }
  await setToken(access_token)
  return { kind: "authenticated" }
}

export async function completeAdministratorMfa(
  challenge: AdministratorMfaChallenge,
  code: string,
): Promise<AdministratorMfaCompletion> {
  let response: Response
  try {
    response = await fetch(apiUrl("/api/auth/mfa/login"), {
      method: "POST",
      ...(IS_WEB_SESSION ? { credentials: "same-origin" as const } : {}),
      headers: {
        "Content-Type": "application/json",
        ...(IS_WEB_SESSION ? {
          "X-LOSPOR-Client": "pwa",
          "X-LOSPOR-Client-Version": LOSPOR_MOBILE_CLIENT_VERSION,
        } : {}),
      },
      body: JSON.stringify({ challengeToken: challenge.challengeToken, code }),
    })
  } catch {
    throw new ApiError("Administrator verification is unreachable.", 0, "NETWORK")
  }

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError(
      body.error ?? "Administrator verification failed.",
      response.status,
      body.code,
      body.serverVersion,
      body,
    )
  }

  const completion = parseAdministratorMfaCompletion(
    body,
    IS_WEB_SESSION ? "PWA" : "NATIVE",
    challenge.enrollmentRequired,
  )
  if (!completion) {
    throw new ApiError("The server returned an invalid MFA response.", 502, "AUTH_RESPONSE_INVALID")
  }
  if (completion.accessToken) await setToken(completion.accessToken)
  return completion
}

export type RegisterAccountInput = {
  firstName: string
  lastName: string
  title?: string
  email: string
  password: string
  institutionId: string
  locale: AppLanguage
  legalAcceptances: LegalAcceptanceReference[]
}

export type RegisterAccountResult = {
  id?: string
  email?: string
  pending?: boolean
  verificationRequired?: boolean
  emailSent?: boolean
  devVerifyUrl?: string
}

export async function registerAccount(input: RegisterAccountInput): Promise<RegisterAccountResult> {
  let res: Response
  try {
    res = await fetch(apiUrl("/api/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, email: input.email.trim().toLowerCase() }),
    })
  } catch {
    throw new ApiError("Registration service is unreachable.", 0, "NETWORK")
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(
      body.error ?? "Registration failed. Please try again.",
      res.status,
      body.code,
      body.serverVersion,
      body,
    )
  }
  return body as RegisterAccountResult
}

export type PasswordResetRequestResult = {
  ok: boolean
  devResetUrl?: string
}

export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  const res = await fetch(apiUrl("/api/auth/password-reset/request"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok && res.status !== 202) {
    throw new Error(body.error ?? "Password reset failed.")
  }
  return { ok: true, devResetUrl: body.devResetUrl }
}

export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  const res = await fetch(apiUrl("/api/auth/password-reset/confirm"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? "Password reset failed.")
  }
}

export async function logout(): Promise<void> {
  if (IS_WEB_SESSION) {
    let response: Response
    try {
      response = await fetch(apiUrl("/api/auth/session"), {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "X-LOSPOR-Client": "pwa",
          "X-LOSPOR-Client-Version": LOSPOR_MOBILE_CLIENT_VERSION,
        },
      })
    } catch {
      throw new ApiError("Sign-out could not be confirmed.", 0, "NETWORK")
    }
    if (!response.ok) {
      throw new ApiError("Sign-out could not be confirmed.", response.status, "LOGOUT_FAILED")
    }
    await clearToken()
    const { clearLocalClinicalCache } = await import("./local-clinical-cache").catch(() => ({
      clearLocalClinicalCache: async () => {},
    }))
    await clearLocalClinicalCache().catch(() => {})
    return
  }

  // Best-effort server-side revocation so a token can't be replayed after logout
  // (e.g. on a lost device). Clear locally regardless of the network result.
  try {
    const token = await getToken()
    if (token) {
      await fetch(apiUrl("/api/auth/logout"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  } catch {
    /* offline or server unreachable — local clear below still logs the user out */
  }
  // Session removal is the security boundary and must not depend on a dynamic
  // cache-cleanup import succeeding. Delete the bearer token first, then erase
  // the explicitly signed-out account's offline clinical data best-effort.
  await clearToken()
  const { clearLocalClinicalCache } = await import("./local-clinical-cache").catch(() => ({
    clearLocalClinicalCache: async () => {},
  }))
  await clearLocalClinicalCache().catch(() => {})
}
