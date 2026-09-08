import { localeFromAccountResponse } from "@lospor/core/account"
import type { AppLocale } from "@/i18n/locales"

/**
 * Reading a `/api/user` response is shared logic and lives in core, which
 * mobile reads the same way. This app's part is the fetch and the persist.
 */
export function accountLocaleFromPayload(value: unknown): AppLocale | undefined {
  return localeFromAccountResponse(value)
}

export async function loadAccountLocale(loginPayload: unknown): Promise<AppLocale | undefined> {
  const fromLogin = accountLocaleFromPayload(loginPayload)
  if (fromLogin) return fromLogin

  try {
    const response = await fetch("/api/user", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
    if (!response.ok) return undefined
    return accountLocaleFromPayload(await response.json())
  } catch {
    return undefined
  }
}

export async function persistAccountLocale(locale: AppLocale): Promise<boolean> {
  try {
    const response = await fetch("/api/user", {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ preferences: { ui: { locale } } }),
    })
    return response.ok
  } catch {
    return false
  }
}

