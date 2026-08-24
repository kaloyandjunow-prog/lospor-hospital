export const APP_LANGUAGES = ["bg", "en"] as const

export type AppLanguage = (typeof APP_LANGUAGES)[number]

export const DEFAULT_APP_LANGUAGE: AppLanguage = "bg"

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "bg" || value === "en"
}

export function normalizeAppLanguage(value: unknown): AppLanguage | null {
  if (isAppLanguage(value)) return value
  if (typeof value !== "string") return null
  const language = value.trim().toLowerCase().split(/[-_]/)[0]
  return isAppLanguage(language) ? language : null
}

type LocalePreferencesEnvelope = {
  preferredLocale?: unknown
  preferences?: unknown
}

/** Accept the canonical preference and the temporary typed API convenience. */
export function localeFromAccountPayload(payload: unknown): AppLanguage | null {
  if (!payload || typeof payload !== "object") return null
  const envelope = payload as LocalePreferencesEnvelope
  if (envelope.preferences && typeof envelope.preferences === "object") {
    const ui = (envelope.preferences as { ui?: unknown }).ui
    if (ui && typeof ui === "object") {
      const canonical = normalizeAppLanguage((ui as { locale?: unknown }).locale)
      if (canonical) return canonical
    }
  }

  // `preferredLocale` is a transitional typed convenience exposed by some API
  // versions. The nested preference above remains authoritative if both exist.
  return normalizeAppLanguage(envelope.preferredLocale)
}

export function formatMessage(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{([^}]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match)
}
