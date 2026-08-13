import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"
import { LOSPOR_MOBILE_CLIENT_VERSION } from "./client-version"


const defaultApiBase = Platform.OS === "web" ? "" : "https://hospital.lospor.invalid"
export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? defaultApiBase).replace(/\/$/, "")

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
  /** Fail locally if a queued clinical write no longer matches this token owner. */
  expectedIdentity?: AuthenticatedIdentity
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
  if (!tokenLoaded) {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY)
    tokenLoaded = true
  }
  return cachedToken
}

export async function setToken(token: string): Promise<void> {
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

export type AuthenticatedIdentity = {
  userId: string
  institutionId: string | null
}

/**
 * The immutable identity used to partition device-local clinical work.
 *
 * It is read from the signed API token, never from form input or mutable UI
 * state. A draft created under one account/institution must not become visible
 * or flushable merely because another clinician later signs in on the device.
 */
export function authenticatedIdentityFromToken(
  token: string | null,
): AuthenticatedIdentity | null {
  const payload = decodeTokenPayload(token)
  const userId = payload?.id
  const institutionId = payload?.institutionId
  if (typeof userId !== "string" || !userId.trim()) return null
  if (institutionId !== null && institutionId !== undefined
    && (typeof institutionId !== "string" || !institutionId.trim())) return null
  return {
    userId,
    institutionId: typeof institutionId === "string" ? institutionId : null,
  }
}

export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
  const token = await getToken()
  if (!token || isTokenExpired(token)) return null
  return authenticatedIdentityFromToken(token)
}

export function isTokenExpired(token: string | null): boolean {
  const payload = decodeTokenPayload(token)
  if (!payload?.exp) return false
  return Date.now() >= Number(payload.exp) * 1000
}

async function buildHeaders(
  extra?: Record<string, string>,
  expectedIdentity?: AuthenticatedIdentity,
): Promise<Record<string, string>> {
  const token = await getToken()
  if (expectedIdentity) {
    const actual = authenticatedIdentityFromToken(token)
    if (!actual || actual.userId !== expectedIdentity.userId
      || actual.institutionId !== expectedIdentity.institutionId) {
      throw new ApiError(
        "The signed-in account changed before this clinical write could be sent.",
        409,
        "LOCAL_AUTH_CONTEXT_CHANGED",
      )
    }
  }
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
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, expectedIdentity, ...requestInit } = init ?? {}
  // buildHeaders validates and uses one token snapshot, closing the race where
  // another account signs in between queued-draft ownership checks and fetch.
  const headers = await buildHeaders(
    requestInit.headers as Record<string, string>,
    expectedIdentity,
  )
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
    throw new ApiError(`Cannot reach server at ${API_BASE}.`, 0, "NETWORK")
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

// Login — stores the token on success, throws on failure
export async function login(email: string, password: string): Promise<void> {
  const res = await fetch(apiUrl("/api/auth/token"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? "Invalid email or password, or the account is not yet approved.")
  }
  const { access_token } = await res.json()
  await setToken(access_token)
}

export type RegisterAccountInput = {
  firstName: string
  lastName: string
  title?: string
  email: string
  password: string
  institutionId?: string
  acceptedTerms: boolean
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
  const res = await fetch(apiUrl("/api/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, email: input.email.trim().toLowerCase() }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error ?? "Registration failed. Please try again.")
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
  const { clearLocalClinicalCache } = await import("./local-clinical-cache")
  await clearLocalClinicalCache().catch(() => {})
  await clearToken()
}
