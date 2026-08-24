import { CURRENT_TERMS_VERSION } from "@lospor/core/account"
import type { AppLocale } from "@/i18n/locales"

export type LegalKind = "TERMS" | "PRIVACY"
export type LegalDeployment = "CLOUD_DEMO" | "LOCAL_HOSPITAL"

export type LegalDocumentDescriptor = {
  kind: LegalKind
  version: string
  effectiveDate: string
  locale: AppLocale
  contentSha256: string
  deployment: LegalDeployment
}

export type LegalAcceptanceReference = Omit<LegalDocumentDescriptor, never>

export const LEGAL_DOCUMENT_DESCRIPTORS = [
  {
    kind: "TERMS",
    version: CURRENT_TERMS_VERSION,
    effectiveDate: "2026-07-03",
    locale: "bg",
    contentSha256: "735c415ac152ea4e0ca590d6151d1e27ed38faba3c1682e61503df4f8ae4df08",
    deployment: "CLOUD_DEMO",
  },
  {
    kind: "TERMS",
    version: CURRENT_TERMS_VERSION,
    effectiveDate: "2026-07-03",
    locale: "en",
    contentSha256: "b67fb33c79aeff1f24569f25af1fa84bdd4378afa641261de0409c2243e9171d",
    deployment: "CLOUD_DEMO",
  },
  {
    kind: "PRIVACY",
    version: CURRENT_TERMS_VERSION,
    effectiveDate: "2026-07-03",
    locale: "bg",
    contentSha256: "9e25b46e55c1a31874c12fc4793cffe4a2bdd34da63798cae98a5987d051082e",
    deployment: "CLOUD_DEMO",
  },
  {
    kind: "PRIVACY",
    version: CURRENT_TERMS_VERSION,
    effectiveDate: "2026-07-03",
    locale: "en",
    contentSha256: "8477edefad59f990ee72a6027248b7bd65c1db59146d89d4db3d61b744a5fc61",
    deployment: "CLOUD_DEMO",
  },
] as const satisfies readonly LegalDocumentDescriptor[]

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Bind the registration checkbox to the exact documents the API has active.
 * The public pages are bundled copy, so a server manifest that differs is not
 * silently accepted on the user's behalf: registration stops until the two
 * deployments carry the same reviewed text and metadata.
 */
export function parseCloudLegalAcceptances(
  value: unknown,
  locale: AppLocale,
): LegalAcceptanceReference[] | null {
  if (!isRecord(value) || value.locale !== locale || !Array.isArray(value.documents)) return null
  const expected = legalAcceptanceReferences(locale)
  if (value.documents.length !== expected.length) return null
  const accepted: LegalAcceptanceReference[] = []
  for (const descriptor of expected) {
    const candidate = value.documents.find(item => isRecord(item) && item.kind === descriptor.kind)
    if (!isRecord(candidate)) return null
    for (const key of ["deployment", "kind", "version", "effectiveDate", "locale", "contentSha256"] as const) {
      if (candidate[key] !== descriptor[key]) return null
    }
    accepted.push(descriptor)
  }
  return accepted
}
