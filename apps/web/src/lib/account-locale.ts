import { parseLocale, type AppLocale } from "@/i18n/locales"

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

/** Reads the canonical User.preferences.ui.locale value from API user/session payloads. */
export function accountLocaleFromPayload(value: unknown): AppLocale | undefined {
  const payload = record(value)
  const user = record(payload.user ?? payload)
  const preferences = record(user.preferences)
  const ui = record(preferences.ui)
  return parseLocale(ui.locale ?? user.preferredLocale)
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

