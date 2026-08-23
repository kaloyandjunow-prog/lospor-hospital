import * as SecureStore from "expo-secure-store"
import { DEFAULT_APP_LANGUAGE, localeFromAccountPayload, type AppLanguage } from "@/i18n/locale"
import { apiFetch, apiJson, decodeTokenPayload, getToken } from "@/lib/api"
const ACCOUNT_LOCALE_KEY_PREFIX = "lospor_account_locale_v1."
function secureAccountKey(accountId: string): string { return `${ACCOUNT_LOCALE_KEY_PREFIX}${accountId.replace(/[^A-Za-z0-9._-]/g, "_")}` }
export async function currentAccountId(): Promise<string | null> {
  const payload = decodeTokenPayload(await getToken().catch(() => null))
  const id = payload?.sub ?? payload?.userId ?? payload?.id
  return typeof id === "string" && id ? id : null
}
async function readLocalAccountLocale(accountId: string): Promise<AppLanguage | null> {
  const value = await SecureStore.getItemAsync(secureAccountKey(accountId)).catch(() => null)
  return value === "bg" || value === "en" ? value : null
}
async function writeLocalAccountLocale(accountId: string, locale: AppLanguage): Promise<void> { await SecureStore.setItemAsync(secureAccountKey(accountId), locale).catch(() => {}) }
export async function loadAuthenticatedLocale(): Promise<{ locale: AppLanguage; source: "server" | "device-account" | "default" }> {
  const accountId = await currentAccountId()
  const local = accountId ? await readLocalAccountLocale(accountId) : null
  try {
    const server = localeFromAccountPayload(await apiJson<unknown>("/api/user"))
    if (server) { if (accountId) await writeLocalAccountLocale(accountId, server); return { locale: server, source: "server" } }
  } catch {}
  return local ? { locale: local, source: "device-account" } : { locale: DEFAULT_APP_LANGUAGE, source: "default" }
}
export async function saveAuthenticatedLocale(locale: AppLanguage): Promise<"synced" | "deferred"> {
  const accountId = await currentAccountId()
  if (accountId) await writeLocalAccountLocale(accountId, locale)
  try {
    const response = await apiFetch("/api/user", { method: "PATCH", body: JSON.stringify({ preferences: { ui: { locale } } }) })
    return response.ok ? "synced" : "deferred"
  } catch { return "deferred" }
}
