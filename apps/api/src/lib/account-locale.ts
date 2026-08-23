export type PreferredLocale = "bg" | "en"

type JsonObject = Record<string, unknown>

function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {}
}

/** Invalid or absent account locale always falls back to Bulgarian. */
export function preferredLocaleFromPreferences(preferences: unknown): PreferredLocale {
  const ui = object(object(preferences).ui)
  return ui.locale === "en" ? "en" : "bg"
}

/** Preserve unrelated preference keys while persisting one explicit login choice. */
export function preferencesWithPreferredLocale(
  preferences: unknown,
  locale: PreferredLocale,
): JsonObject {
  const root = object(preferences)
  return { ...root, ui: { ...object(root.ui), locale } }
}
