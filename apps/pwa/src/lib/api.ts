import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"

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
const LAST_OK_KEY = "lospor_last_ok_request"
const LAST_ERROR_KEY = "lospor_last_api_error"
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

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token)
}

export async function clearToken(): Promise<void> {
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

export async function getLastOkRequest(): Promise<string | null> {
  return SecureStore.getItemAsync(LAST_OK_KEY)
}

export async function getLastApiError(): Promise<string | null> {
  return SecureStore.getItemAsync(LAST_ERROR_KEY)
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
    "X-LOSPOR-Client-Version": "7.3.0",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

export async function apiFetch(path: string, init?: ApiRequestInit): Promise<Response> {
  const headers = await buildHeaders(init?.headers as Record<string, string>)
  const { timeoutMs, ...requestInit } = init ?? {}
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
      await SecureStore.setItemAsync(LAST_OK_KEY, new Date().toISOString())
    } else {
      await SecureStore.setItemAsync(LAST_ERROR_KEY, `${res.status} ${path}`)
      if (res.status === 401) await handleUnauthorized()
    }
    return res
  } catch (err) {
    await SecureStore.setItemAsync(LAST_ERROR_KEY, `Network error ${path}`)
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
