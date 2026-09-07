import { Platform } from "react-native"
import type { AppLanguage } from "@/i18n/locale"

export type LegalDocumentKind = "terms" | "privacy"

/** Where the public distribution's Web application lives. */
const PUBLIC_WEB_BASE = "https://app.lospor.org"

/**
 * Resolve legal pages against the Web application serving this client.
 *
 * Which origin that is depends on how the PWA was deployed, and the two cases
 * are genuinely different:
 *
 * - On an appliance the PWA is mounted at `/app` on the clinical host and the
 *   Web application is at `/` on that same host, so its own origin is right —
 *   and is the only right answer, since the hospital's hostname is not
 *   knowable here.
 * - On the public deployment the PWA owns its origin (`pwa.lospor.org`) and the
 *   Web application is somewhere else entirely. Its own origin serves no legal
 *   pages at all, so using it produced a link to a 404 — which is what this
 *   shipped as.
 *
 * A configured base therefore wins outright, rather than only being consulted
 * off the web: it is a deployment stating where its Web application is, and
 * nothing inferred should override a statement. Absent one, a web client
 * assumes the same origin, which keeps every appliance working without
 * configuration.
 */
export function legalDocumentUrl(
  kind: LegalDocumentKind,
  locale: AppLanguage,
  context: { platform?: string; webOrigin?: string | null; configuredWebBase?: string | null } = {},
): string {
  const platform = context.platform ?? Platform.OS
  const runtimeOrigin = context.webOrigin
    ?? (typeof window !== "undefined" ? window.location.origin : null)
  const configured = context.configuredWebBase ?? process.env.EXPO_PUBLIC_WEB_BASE ?? null
  const resolved = configured
    ?? (platform === "web" && runtimeOrigin ? runtimeOrigin : PUBLIC_WEB_BASE)
  return `${resolved.replace(/\/$/, "")}/${kind}?locale=${encodeURIComponent(locale)}`
}
