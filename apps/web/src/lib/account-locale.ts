import { parseLocale, type AppLocale } from "@/i18n/locales"
function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
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
    const response = await fetch("/api/user", { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } })
    return response.ok ? accountLocaleFromPayload(await response.json()) : undefined
  } catch { return undefined }
}
export async function persistAccountLocale(locale: AppLocale): Promise<boolean> {
  try {
    return (await fetch("/api/user", { method: "PATCH", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ preferences: { ui: { locale } } }) })).ok
  } catch { return false }
}
