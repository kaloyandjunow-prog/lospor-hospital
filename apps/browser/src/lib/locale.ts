import type { Locale } from "./i18n"

export const DEFAULT_LOCALE: Locale = "bg"
export const DEVICE_LOCALE_COOKIE = "lospor_database_locale"
export const EXPLICIT_LOGIN_LOCALE_KEY = "lospor:login-locale:v1"

export function normalizeLocale(value: unknown, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (typeof value !== "string") return fallback
  const normalized = value.trim().toLowerCase()
  return normalized === "bg" || normalized === "en" ? normalized : fallback
}

export function preAuthLocale(deviceValue: unknown, applianceValue: unknown): Locale {
  return normalizeLocale(deviceValue, normalizeLocale(applianceValue))
}

export function localeFromSessionUser(user: unknown, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (!user || typeof user !== "object") return fallback
  const record = user as {
    preferredLocale?: unknown
    preferences?: { ui?: { locale?: unknown } } | null
  }
  return normalizeLocale(
    record.preferences?.ui?.locale ?? record.preferredLocale,
    fallback,
  )
}

export function deviceLocaleCookie(locale: Locale) {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:"
  return `${DEVICE_LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax${secure ? "; secure" : ""}`
}
