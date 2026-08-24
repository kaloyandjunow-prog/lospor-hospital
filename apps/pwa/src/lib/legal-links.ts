import { Platform } from "react-native"
import type { AppLanguage } from "@/i18n/locale"

export type LegalDocumentKind = "terms" | "privacy"

/** Resolve legal pages against the Web application serving this client. */
export function legalDocumentUrl(
  kind: LegalDocumentKind,
  locale: AppLanguage,
  context: { platform?: string; webOrigin?: string | null; configuredWebBase?: string | null } = {},
): string {
  const platform = context.platform ?? Platform.OS
  const runtimeOrigin = context.webOrigin
    ?? (typeof window !== "undefined" ? window.location.origin : null)
  const configured = context.configuredWebBase
    ?? process.env.EXPO_PUBLIC_WEB_BASE
    ?? "https://app.lospor.org"
  const base = (platform === "web" && runtimeOrigin ? runtimeOrigin : configured).replace(/\/$/, "")
  return `${base}/${kind}?locale=${encodeURIComponent(locale)}`
}
