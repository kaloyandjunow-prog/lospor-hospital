import { localeFromAccountResponse } from "@lospor/core/account"

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

/**
 * Reading a `/api/user` response is shared logic and lives in core, which web
 * reads the same way. This used to be parsed here separately and missed the
 * `{ user: {...} }` envelope web already handled, so that response shape
 * silently fell back to the device default on the phone only.
 */
export function localeFromAccountPayload(payload: unknown): AppLanguage | null {
  return localeFromAccountResponse(payload) ?? null
}

export function formatMessage(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{([^}]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match)
}
