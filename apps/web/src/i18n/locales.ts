import en from "../../messages/en.json"
import bg from "../../messages/bg.json"

export const APP_LOCALES = ["bg", "en"] as const
export type AppLocale = (typeof APP_LOCALES)[number]
export const DEFAULT_LOCALE: AppLocale = "bg"
export const DEVICE_LOCALE_COOKIE = "lospor_device_locale"
export const ACCOUNT_LOCALE_COOKIE = "lospor_account_locale"
export const LOGIN_LOCALE_CHOICE_COOKIE = "lospor_login_locale_choice"
export const LEGACY_LOCALE_COOKIE = "locale"
export const SESSION_COOKIE = "lospor_session"

export function parseLocale(value: unknown): AppLocale | undefined {
  return value === "bg" || value === "en" ? value : undefined
}

export function configuredDefaultLocale(value: unknown = process.env.LOSPOR_DEFAULT_LOCALE): AppLocale {
  return parseLocale(value) ?? DEFAULT_LOCALE
}

export function resolveRequestLocale({ account, device, loginChoice, legacy, configuredDefault = process.env.LOSPOR_DEFAULT_LOCALE }: {
  account?: unknown; device?: unknown; loginChoice?: unknown; legacy?: unknown; configuredDefault?: unknown
}): AppLocale {
  return parseLocale(account) ?? parseLocale(device) ?? parseLocale(loginChoice)
    ?? parseLocale(legacy) ?? configuredDefaultLocale(configuredDefault)
}

type Messages = Record<string, unknown>
function isRecord(value: unknown): value is Messages {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

export function mergeWithEnglishFallback(translated: Messages, fallback: Messages = en): Messages {
  const merged: Messages = { ...fallback }
  for (const [key, value] of Object.entries(translated)) {
    const fallbackValue = fallback[key]
    merged[key] = isRecord(value) && isRecord(fallbackValue)
      ? mergeWithEnglishFallback(value, fallbackValue) : value
  }
  return merged
}

export function messagesForLocale(locale: AppLocale): Messages {
  const selected = locale === "bg" ? bg as Messages : en as Messages
  return locale === "en" ? selected : mergeWithEnglishFallback(selected)
}
