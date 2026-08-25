import * as SecureStore from "expo-secure-store"
import { DEFAULT_APP_LANGUAGE, localeFromAccountPayload, type AppLanguage } from "@/i18n/locale"
import { apiFetch, apiJson, decodeTokenPayload, getToken } from "@/lib/api"

const ACCOUNT_LOCALE_KEY_PREFIX = "lospor_account_locale_v1."

function secureAccountKey(accountId: string): string {
  // Expo SecureStore accepts alphanumeric characters plus `.`, `-` and `_`.
  return `${ACCOUNT_LOCALE_KEY_PREFIX}${accountId.replace(/[^A-Za-z0-9._-]/g, "_")}`
}

export async function currentAccountId(): Promise<string | null> {
  const payload = decodeTokenPayload(await getToken().catch(() => null))
  const id = payload?.sub ?? payload?.userId ?? payload?.id
  return typeof id === "string" && id ? id : null
}

async function readLocalAccountLocale(accountId: string): Promise<AppLanguage | null> {
  const value = await SecureStore.getItemAsync(secureAccountKey(accountId)).catch(() => null)
  return value === "bg" || value === "en" ? value : null
}

async function writeLocalAccountLocale(accountId: string, locale: AppLanguage): Promise<void> {
  await SecureStore.setItemAsync(secureAccountKey(accountId), locale).catch(() => {})
}

export type AccountLocaleLoadResult = {
  locale: AppLanguage
  source: "server" | "device-account" | "default"
}

/**
 * Read the account authority without making login depend on the API rollout.
 * Older APIs may omit `preferences.ui.locale`; a per-account device copy keeps
 * accounts separated and Bulgarian remains the final fallback.
 */
export async function loadAuthenticatedLocale(): Promise<AccountLocaleLoadResult> {
  const accountId = await currentAccountId()
  const local = accountId ? await readLocalAccountLocale(accountId) : null

  try {
    const account = await apiJson<unknown>("/api/user")
    const server = localeFromAccountPayload(account)
    if (server) {
      if (accountId) await writeLocalAccountLocale(accountId, server)
      return { locale: server, source: "server" }
    }
  } catch {
    // Locale sync must not make an otherwise valid session unusable while the
    // API and clients are deployed in separate waves.
  }

  if (local) return { locale: local, source: "device-account" }
  return { locale: DEFAULT_APP_LANGUAGE, source: "default" }
}

export type AccountLocaleSaveResult = "synced" | "deferred"

/**
 * Save locally first, then best-effort PATCH the canonical account preference.
 * A 1.2.0 Mobile build therefore remains usable against the pre-rollout API and
 * retries naturally when the user changes language or signs in again.
 */
export async function saveAuthenticatedLocale(
  locale: AppLanguage,
): Promise<AccountLocaleSaveResult> {
  const accountId = await currentAccountId()
  if (accountId) await writeLocalAccountLocale(accountId, locale)

  try {
    const response = await apiFetch("/api/user", {
      method: "PATCH",
      body: JSON.stringify({ preferences: { ui: { locale } } }),
    })
    return response.ok ? "synced" : "deferred"
  } catch {
    return "deferred"
  }
}

