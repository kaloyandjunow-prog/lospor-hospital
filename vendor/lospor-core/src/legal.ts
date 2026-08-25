import type { PreferredLocale } from "./account"

export const LEGAL_DOCUMENT_KINDS = ["TERMS", "PRIVACY"] as const
export type LegalDocumentKind = (typeof LEGAL_DOCUMENT_KINDS)[number]

export type LegalDocumentDescriptor = {
  deployment: string
  kind: LegalDocumentKind
  version: string
  /** ISO 8601 calendar date, for example `2026-09-01`. */
  effectiveDate: string
  locale: PreferredLocale
  /** Lowercase SHA-256 hex of the exact UTF-8 content. */
  contentSha256: string
  /** Exact content whose hash is recorded; clients must display this text. */
  content: string
}

export type LegalDocumentManifest = {
  deployment: string
  documents: LegalDocumentDescriptor[]
}

export type LegalAcceptanceReference = Omit<LegalDocumentDescriptor, "content">

export type LegalAcceptanceRecordDto = LegalAcceptanceReference & {
  acceptedAt: string
}

export class LegalDocumentConfigurationError extends Error {
  constructor(
    readonly code:
      | "LEGAL_DEPLOYMENT_MISMATCH"
      | "LEGAL_DOCUMENT_MISSING"
      | "LEGAL_DOCUMENT_DUPLICATE",
    message: string,
  ) {
    super(message)
    this.name = "LegalDocumentConfigurationError"
  }
}

/**
 * Return the exact required document set for one locale.
 *
 * There is intentionally no locale fallback. Accepting an English hash while
 * the clinician was shown Bulgarian (or the reverse) would make the record
 * precise-looking but false. A deployment missing either translation must be
 * fixed before registration or re-acceptance can continue.
 */
export function requiredLegalDocuments(
  manifest: LegalDocumentManifest,
  locale: PreferredLocale,
): LegalDocumentDescriptor[] {
  const result = LEGAL_DOCUMENT_KINDS.map(kind => {
    const matches = manifest.documents.filter(document =>
      document.locale === locale
      && document.kind === kind)

    if (matches.length === 0) {
      throw new LegalDocumentConfigurationError(
        "LEGAL_DOCUMENT_MISSING",
        `Missing ${kind} document for ${manifest.deployment}/${locale}`,
      )
    }
    if (matches.length > 1) {
      throw new LegalDocumentConfigurationError(
        "LEGAL_DOCUMENT_DUPLICATE",
        `Multiple ${kind} documents for ${manifest.deployment}/${locale}`,
      )
    }
    const document = matches[0]
    if (document.deployment !== manifest.deployment) {
      throw new LegalDocumentConfigurationError(
        "LEGAL_DEPLOYMENT_MISMATCH",
        `Document deployment ${document.deployment} does not match ${manifest.deployment}`,
      )
    }
    return document
  })
  return result
}

export function legalAcceptanceMatches(
  acceptance: LegalAcceptanceReference,
  document: LegalDocumentDescriptor,
): boolean {
  return acceptance.deployment === document.deployment
    && acceptance.kind === document.kind
    && acceptance.version === document.version
    && acceptance.effectiveDate === document.effectiveDate
    && acceptance.locale === document.locale
    && acceptance.contentSha256 === document.contentSha256
}

/** Exact acceptances are required for both current documents, with no extras. */
export function validateLegalAcceptances(
  documents: readonly LegalDocumentDescriptor[],
  acceptances: readonly LegalAcceptanceReference[],
): { ok: true } | { ok: false; missingKinds: LegalDocumentKind[]; unexpected: number } {
  const missingKinds = documents
    .filter(document => !acceptances.some(acceptance => legalAcceptanceMatches(acceptance, document)))
    .map(document => document.kind)
  const unexpected = acceptances.filter(acceptance =>
    !documents.some(document => legalAcceptanceMatches(acceptance, document))).length

  return missingKinds.length === 0 && unexpected === 0
    ? { ok: true }
    : { ok: false, missingKinds, unexpected }
}
