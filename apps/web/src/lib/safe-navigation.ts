const SAFE_CALLBACK_ROOTS = [
  "/dashboard",
  "/cases",
  "/admin",
  "/clinical-rules",
] as const

export const DEFAULT_CALLBACK_URL = "/dashboard"

export function safeCallbackUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048) return DEFAULT_CALLBACK_URL
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return DEFAULT_CALLBACK_URL
  }
  if (
    /[\u0000-\u001f\u007f]/.test(value)
    || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)
  ) return DEFAULT_CALLBACK_URL

  try {
    const parsed = new URL(value, "https://lospor.invalid")
    if (parsed.origin !== "https://lospor.invalid") return DEFAULT_CALLBACK_URL
    const allowed = SAFE_CALLBACK_ROOTS.some(root =>
      parsed.pathname === root || parsed.pathname.startsWith(`${root}/`),
    )
    return allowed ? `${parsed.pathname}${parsed.search}${parsed.hash}` : DEFAULT_CALLBACK_URL
  } catch {
    return DEFAULT_CALLBACK_URL
  }
}

export function loginUrlForCallback(pathname: string, search = ""): string {
  const callback = safeCallbackUrl(`${pathname}${search}`)
  const params = new URLSearchParams({ callbackUrl: callback })
  return `/login?${params.toString()}`
}

export function safeResetPath(value: unknown, origin: string): string | undefined {
  if (typeof value !== "string" || value.length > 4_096) return undefined
  try {
    const expected = new URL(origin)
    const parsed = new URL(value, expected)
    if (parsed.origin !== expected.origin || parsed.pathname !== "/reset-password") {
      return undefined
    }
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return undefined
  }
}
