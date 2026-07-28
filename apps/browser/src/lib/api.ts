import "server-only"
import { cookies } from "next/headers"

const API_INTERNAL_URL = (
  process.env.LOSPOR_API_INTERNAL_URL ?? "http://127.0.0.1:3002"
).replace(/\/$/, "")

const DATABASE_ORIGIN = (
  process.env.LOSPOR_DATABASE_ORIGIN ??
  process.env.NEXT_PUBLIC_DATABASE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3003")
).replace(/\/$/, "")

const STATE_CHANGING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"])

export type SessionUser = {
  id: string
  email: string
  name: string
  role: string
  institutionId: string | null
  institutionName: string | null
}

export type Session = { user: SessionUser }

function cookieHeader(values: Awaited<ReturnType<typeof cookies>>) {
  return values.getAll()
    .map(({ name, value }) => `${name}=${encodeURIComponent(value)}`)
    .join("; ")
}

export async function apiServerFetch(path: string, init: RequestInit = {}) {
  const store = await cookies()
  const headers = new Headers(init.headers)
  const cookie = cookieHeader(store)
  if (cookie) headers.set("cookie", cookie)
  if (STATE_CHANGING_METHODS.has((init.method ?? "GET").toUpperCase()) && !headers.has("origin")) {
    headers.set("origin", DATABASE_ORIGIN)
  }
  headers.set("x-lospor-client", "database")
  headers.set("x-lospor-client-version", "0.2.1")
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

export async function currentSession(): Promise<Session | null> {
  const response = await apiServerFetch("/v1/auth/session").catch(() => null)
  if (!response?.ok) return null
  return response.json() as Promise<Session>
}
