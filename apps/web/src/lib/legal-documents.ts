import {
  CLOUD_DEMO_LEGAL_DOCUMENTS,
  parseLegalAcceptanceManifest,
  type LegalDeployment,
  type LegalDocumentKind,
} from "@lospor/core/legal"
import type { AppLocale } from "@/i18n/locales"

export type { LegalDeployment }
export type LegalKind = LegalDocumentKind

export type LegalDocumentDescriptor = {
  kind: LegalKind
  version: string
  effectiveDate: string
  locale: AppLocale
  contentSha256: string
  deployment: LegalDeployment
}

export type LegalAcceptanceReference = LegalDocumentDescriptor

/**
 * The cloud demo's reviewed text, hashed from this app's own bundled message
 * copy by `scripts/generate-cloud-legal-manifest.mjs`. The values are shared
 * with mobile through core so both clients hold the server to the same
 * fingerprints; the derivation stays here, since only this app has the
 * message bundle they are derived from.
 */
export const LEGAL_DOCUMENT_DESCRIPTORS = CLOUD_DEMO_LEGAL_DOCUMENTS as readonly LegalDocumentDescriptor[]

export function legalDocumentDescriptor(
  kind: LegalKind,
  locale: AppLocale,
): LegalDocumentDescriptor {
  const descriptor = LEGAL_DOCUMENT_DESCRIPTORS.find(
    item => item.kind === kind && item.locale === locale,
  )
  if (!descriptor) {
    // Legal documents must never fall back to another locale or deployment.
    throw new Error(`No active ${kind} descriptor for locale ${locale}`)
  }
  return descriptor
}

export function legalAcceptanceReferences(locale: AppLocale): LegalAcceptanceReference[] {
  return (["TERMS", "PRIVACY"] as const).map(kind => ({ ...legalDocumentDescriptor(kind, locale) }))
}

/**
 * Bind the registration checkbox to the exact documents the API has active.
 *
 * The check itself is core's, shared with mobile: exact fingerprints for the
 * cloud demo, well-formed and internally consistent for anything else. The
 * public pages are bundled copy, so a cloud-demo manifest that differs is not
 * silently accepted on the user's behalf -- registration stops until the two
 * deployments carry the same reviewed text and metadata.
 */
export function parseCloudLegalAcceptances(
  value: unknown,
  locale: AppLocale,
): LegalAcceptanceReference[] | null {
  return parseLegalAcceptanceManifest(value, locale) as LegalAcceptanceReference[] | null
}
