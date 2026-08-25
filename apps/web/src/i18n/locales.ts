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

/**
 * The installer can choose the unauthenticated appliance default at runtime.
 * Never allow an arbitrary environment value to become a message-bundle key.
 */
export function configuredDefaultLocale(
  value: unknown = process.env.LOSPOR_DEFAULT_LOCALE,
): AppLocale {
  return parseLocale(value) ?? DEFAULT_LOCALE
}

export type RequestLocaleSources = {
  account?: unknown
  device?: unknown
  loginChoice?: unknown
  legacy?: unknown
  configuredDefault?: unknown
}

export function resolveRequestLocale({
  account,
  device,
  loginChoice,
  legacy,
  configuredDefault = process.env.LOSPOR_DEFAULT_LOCALE,
}: RequestLocaleSources): AppLocale {
  return parseLocale(account)
    ?? parseLocale(device)
    ?? parseLocale(loginChoice)
    ?? parseLocale(legacy)
    ?? configuredDefaultLocale(configuredDefault)
}

type Messages = Record<string, unknown>

function isRecord(value: unknown): value is Messages {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

/**
 * English remains a runtime safety net for non-legal UI. CI separately requires
 * every shipped Bulgarian and English key to exist, so this fallback is only a
 * last line of defence against a partially deployed message bundle.
 */
export function mergeWithEnglishFallback(
  translated: Messages,
  fallback: Messages = en,
): Messages {
  const merged: Messages = { ...fallback }
  for (const [key, value] of Object.entries(translated)) {
    const fallbackValue = fallback[key]
    merged[key] = isRecord(value) && isRecord(fallbackValue)
      ? mergeWithEnglishFallback(value, fallbackValue)
      : value
  }
  return merged
}

function assertExactLegalMessages(locale: AppLocale, messages: Messages) {
  const expected = (en as Messages).legal
  const actual = messages.legal
  if (!isRecord(expected) || !isRecord(actual)) {
    throw new Error(`Missing legal messages for locale ${locale}`)
  }

  const visit = (reference: unknown, candidate: unknown, path: string) => {
    if (Array.isArray(reference)) {
      if (!Array.isArray(candidate) || candidate.length !== reference.length) {
        throw new Error(`Incomplete legal message collection ${path} for locale ${locale}`)
      }
      reference.forEach((value, index) => visit(value, candidate[index], `${path}.${index}`))
      return
    }
    if (isRecord(reference)) {
      if (!isRecord(candidate)) {
        throw new Error(`Missing legal message ${path} for locale ${locale}`)
      }
      for (const [key, value] of Object.entries(reference)) {
        visit(value, candidate[key], `${path}.${key}`)
      }
      return
    }
    if (typeof reference === "string" && (typeof candidate !== "string" || !candidate.trim())) {
      throw new Error(`Missing legal message ${path} for locale ${locale}`)
    }
  }

  visit(expected, actual, "legal")
}

export function messagesForLocale(locale: AppLocale): Messages {
  const selected = locale === "bg" ? bg as Messages : en as Messages
  // Legal copy must never silently fall back to a different language.
  assertExactLegalMessages(locale, selected)
  return locale === "en" ? selected : mergeWithEnglishFallback(selected)
}

export type PwaManifestCopy = {
  name: string
  shortName: string
  description: string
}

export function pwaManifestCopyForLocale(locale: AppLocale): PwaManifestCopy {
  const messages = messagesForLocale(locale)
  const pwa = messages.pwa
  if (!isRecord(pwa)) throw new Error(`Missing PWA messages for locale ${locale}`)

  const copy = {
    name: pwa.manifestName,
    shortName: pwa.manifestShortName,
    description: pwa.manifestDescription,
  }
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Missing PWA manifest message ${key} for locale ${locale}`)
    }
  }
  return copy as PwaManifestCopy
}
