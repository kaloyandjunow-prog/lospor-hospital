import { DEFAULT_APP_LANGUAGE, normalizeAppLanguage, type AppLanguage } from "@/i18n/locale"
import { apiUrl } from "@/lib/api"

const APPLIANCE_LOCALE_TIMEOUT_MS = 3_000

/**
 * Read the unauthenticated appliance default. The public endpoint is deployed
 * with the 1.2.0 API; older, offline and malformed servers all fail closed to
 * Bulgarian so Mobile can roll out independently.
 */
export async function loadApplianceDefaultLocale(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = APPLIANCE_LOCALE_TIMEOUT_MS,
): Promise<AppLanguage> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(apiUrl("/api/locale"), {
      headers: {
        "X-LOSPOR-Client": "mobile",
      },
      signal: controller.signal,
    })
    if (!response.ok) return DEFAULT_APP_LANGUAGE
    const payload: unknown = await response.json().catch(() => null)
    if (!payload || typeof payload !== "object") return DEFAULT_APP_LANGUAGE
    return normalizeAppLanguage((payload as { locale?: unknown }).locale)
      ?? DEFAULT_APP_LANGUAGE
  } catch {
    return DEFAULT_APP_LANGUAGE
  } finally {
    clearTimeout(timeout)
  }
}
