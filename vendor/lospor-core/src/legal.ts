import { CURRENT_TERMS_VERSION, type PreferredLocale } from "./account"

export const LEGAL_DOCUMENT_KINDS = ["TERMS", "PRIVACY"] as const
export type LegalDocumentKind = (typeof LEGAL_DOCUMENT_KINDS)[number]

/**
 * The two deployments a client can name. This is narrower than what the API
 * actually accepts -- `LOSPOR_LEGAL_DOCUMENTS_JSON` takes any non-empty
 * deployment id, so a hospital appliance could in principle configure one
 * that is neither of these. Both clients have only ever recognised these two,
 * and this keeps that existing behaviour rather than widening it.
 */
export const LEGAL_DEPLOYMENTS = ["CLOUD_DEMO", "LOCAL_HOSPITAL"] as const
export type LegalDeployment = (typeof LEGAL_DEPLOYMENTS)[number]

/** The one deployment whose text every client is allowed to know in advance. */
export const CLOUD_DEMO_DEPLOYMENT: LegalDeployment = "CLOUD_DEMO"

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

/**
 * The cloud demo's exact terms and privacy text, in both languages.
 *
 * `lospor.org` is one specific, known server, and both clients ship a reviewed
 * copy of what it must say -- these hashes are generated from that bundled
 * copy by `scripts/generate-cloud-legal-manifest.mjs` in the web app, which
 * remains the source of truth for the values. They are duplicated here as
 * data only so a client asking "did the server return what was reviewed?" has
 * one place to ask it, rather than two hard-coded tables that can drift.
 *
 * No other deployment gets this treatment. A hospital appliance's terms are
 * set by its own operator through `LOSPOR_LEGAL_DOCUMENTS_JSON` and cannot be
 * known by any client in advance -- the most either app can verify for one is
 * that the manifest is well-formed and internally consistent, which
 * `parseLegalAcceptanceManifest` still does for it.
 */
export const CLOUD_DEMO_LEGAL_DOCUMENTS: readonly LegalAcceptanceReference[] = [
  {
    kind: "TERMS",
    version: CURRENT_TERMS_VERSION,
    effectiveDate: "2026-07-03",
    locale: "bg",
    contentSha256: "735c415ac152ea4e0ca590d6151d1e27ed38faba3c1682e61503df4f8ae4df08",
    deployment: CLOUD_DEMO_DEPLOYMENT,
  },
  {
    kind: "TERMS",
    version: CURRENT_TERMS_VERSION,
    effectiveDate: "2026-07-03",
    locale: "en",
    contentSha256: "b67fb33c79aeff1f24569f25af1fa84bdd4378afa641261de0409c2243e9171d",
    deployment: CLOUD_DEMO_DEPLOYMENT,
  },
  {
    kind: "PRIVACY",
    version: CURRENT_TERMS_VERSION,
    effectiveDate: "2026-07-03",
    locale: "bg",
    contentSha256: "9e25b46e55c1a31874c12fc4793cffe4a2bdd34da63798cae98a5987d051082e",
    deployment: CLOUD_DEMO_DEPLOYMENT,
  },
  {
    kind: "PRIVACY",
    version: CURRENT_TERMS_VERSION,
    effectiveDate: "2026-07-03",
    locale: "en",
    contentSha256: "8477edefad59f990ee72a6027248b7bd65c1db59146d89d4db3d61b744a5fc61",
    deployment: CLOUD_DEMO_DEPLOYMENT,
  },
]

function cloudDemoLegalDescriptor(
  kind: LegalDocumentKind,
  locale: PreferredLocale,
): LegalAcceptanceReference | undefined {
  return CLOUD_DEMO_LEGAL_DOCUMENTS.find(document => document.kind === kind && document.locale === locale)
}

function isLegalManifestRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isLegalDeployment(value: unknown): value is LegalDeployment {
  return value === "CLOUD_DEMO" || value === "LOCAL_HOSPITAL"
}

function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/**
 * Reduce a `/legal/documents` response to the exact references a registration
 * submits, or `null` if it cannot be trusted.
 *
 * Every deployment is held to the same baseline: exactly one TERMS and one
 * PRIVACY document, in the requested locale, both from the same deployment,
 * each carrying a plausible version, date and hash. That is the most that can
 * be asked of a hospital appliance, whose text its own operator controls.
 *
 * The cloud demo is held to more, because more is possible: its text is
 * reviewed and bundled into every client, so a returned document is checked
 * against the exact version, date and hash that copy was hashed from. A
 * mismatch there is not a formatting problem -- it means the server is not
 * serving what was reviewed, and registration must stop rather than bind
 * someone to text nobody has read.
 */
export function parseLegalAcceptanceManifest(
  value: unknown,
  locale: PreferredLocale,
): LegalAcceptanceReference[] | null {
  if (!isLegalManifestRecord(value) || value.locale !== locale || !Array.isArray(value.documents)) {
    return null
  }
  if (value.documents.length !== LEGAL_DOCUMENT_KINDS.length) return null

  const result: LegalAcceptanceReference[] = []
  for (const kind of LEGAL_DOCUMENT_KINDS) {
    const document = value.documents.find(item => isLegalManifestRecord(item) && item.kind === kind)
    if (
      !isLegalManifestRecord(document)
      || !isLegalDeployment(document.deployment)
      || typeof document.version !== "string" || !document.version
      || document.locale !== locale
      || !isIsoCalendarDate(document.effectiveDate)
      || typeof document.contentSha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(document.contentSha256)
    ) {
      return null
    }

    if (document.deployment === CLOUD_DEMO_DEPLOYMENT) {
      const known = cloudDemoLegalDescriptor(kind, locale)
      if (
        !known
        || document.version !== known.version
        || document.effectiveDate !== known.effectiveDate
        || document.contentSha256 !== known.contentSha256
      ) {
        return null
      }
      result.push(known)
      continue
    }

    result.push({
      deployment: document.deployment,
      kind,
      version: document.version,
      effectiveDate: document.effectiveDate,
      locale,
      contentSha256: document.contentSha256,
    })
  }

  // Both documents must be sworn to by the same deployment; a manifest mixing
  // the cloud demo's PRIVACY notice with a hospital's TERMS is not a real
  // deployment's pair, whatever each document looks like on its own.
  if (result[0]?.deployment !== result[1]?.deployment) return null
  return result
}
