import "server-only"
import { cookies } from "next/headers"
import { LOSPOR_WEB_CLIENT_VERSION } from "@/lib/client-version"
import { apiErrorCode } from "@/lib/public-api-errors"
import type { AppLocale } from "@/i18n/locales"

export type ApiSessionUser = {
  id: string
  email: string
  name: string
  role: string
  institutionId: string | null
  institutionName: string | null
  firstName: string | null
  lastName: string | null
  title: string | null
  jti: string | null
  acceptedTermsAt: string | null
  lastLoginAt: string | null
  accountKind?: "CLINICAL" | "RESEARCH_ONLY"
  preferences?: { ui?: { locale?: AppLocale } }
  preferredLocale?: AppLocale
}

export type ApiSession = { user: ApiSessionUser }

const API_INTERNAL_URL = (
  process.env.LOSPOR_API_INTERNAL_URL ?? "http://127.0.0.1:3002"
).replace(/\/$/, "")

function requestCookieHeader(values: Awaited<ReturnType<typeof cookies>>) {
  return values
    .getAll()
    .map(({ name, value }) => `${name}=${encodeURIComponent(value)}`)
    .join("; ")
}

export async function apiServerFetch(path: string, init: RequestInit = {}) {
  const cookieStore = await cookies()
  const headers = new Headers(init.headers)
  const cookieHeader = requestCookieHeader(cookieStore)
  if (cookieHeader) headers.set("cookie", cookieHeader)
  headers.set("x-lospor-client", "web")
  headers.set("x-lospor-client-version", LOSPOR_WEB_CLIENT_VERSION)

  return fetch(`${API_INTERNAL_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  })
}

export async function apiServerJson<T>(path: string, init: RequestInit = {}) {
  const response = await apiServerFetch(path, init)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? `API request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export type LiveSessionResult = {
  session: ApiSession | null
  errorCode?: string
}

export async function getLiveSessionResult(): Promise<LiveSessionResult> {
  const response = await apiServerFetch("/v1/auth/session").catch(() => null)
  if (!response) return { session: null }
  const body: unknown = await response.json().catch(() => ({}))
  if (!response.ok) return { session: null, errorCode: apiErrorCode(body) }
  const session = body as ApiSession
  if (
    session.user?.accountKind === "RESEARCH_ONLY"
    || session.user?.role === "RESEARCH_ONLY"
  ) {
    return { session: null, errorCode: "CLINICAL_APP_FORBIDDEN" }
  }
  return { session }
}

export async function getLiveSession(): Promise<ApiSession | null> {
  return (await getLiveSessionResult()).session
}
