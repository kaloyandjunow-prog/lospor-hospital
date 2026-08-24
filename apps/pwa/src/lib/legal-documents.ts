import { useEffect, useState } from "react"
import type { AppLanguage } from "@/i18n/locale"
import { apiUrl } from "@/lib/api"

export type LegalAcceptanceReference = {
  deployment: "CLOUD_DEMO" | "LOCAL_HOSPITAL"
  kind: "TERMS" | "PRIVACY"
  version: string
  effectiveDate: string
  locale: AppLanguage
  contentSha256: string
}

type LegalDocumentsState = {
  locale: AppLanguage
  acceptances: LegalAcceptanceReference[] | null
  loading: boolean
  failed: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isLegalDeployment(
  value: unknown,
): value is LegalAcceptanceReference["deployment"] {
  return value === "CLOUD_DEMO" || value === "LOCAL_HOSPITAL"
}

/**
 * Reduce the public legal manifest to the exact references the registration
 * endpoint accepts. Content is deliberately not copied into the submission.
 */
export function parseRegistrationLegalDocuments(
  value: unknown,
  locale: AppLanguage,
): LegalAcceptanceReference[] | null {
  if (!isRecord(value) || value.locale !== locale || !Array.isArray(value.documents)) return null
  if (value.documents.length !== 2) return null

  const result: LegalAcceptanceReference[] = []
  for (const kind of ["TERMS", "PRIVACY"] as const) {
    const document = value.documents.find(item => isRecord(item) && item.kind === kind)
    if (!isRecord(document)
      || !isLegalDeployment(document.deployment)
      || typeof document.version !== "string" || !document.version
      || document.locale !== locale
      || !isIsoDate(document.effectiveDate)
      || typeof document.contentSha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(document.contentSha256)) {
      return null
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
  if (result[0]?.deployment !== result[1]?.deployment) return null
  return result
}

export async function loadRegistrationLegalDocuments(
  locale: AppLanguage,
  fetchImpl: typeof fetch = fetch,
): Promise<LegalAcceptanceReference[]> {
  const response = await fetchImpl(apiUrl(`/api/legal/documents?locale=${encodeURIComponent(locale)}`), {
    headers: { Accept: "application/json" },
    ...(typeof window !== "undefined" ? { credentials: "same-origin" as const } : {}),
  })
  if (!response.ok) throw new Error("legal-documents-unavailable")
  const parsed = parseRegistrationLegalDocuments(await response.json(), locale)
  if (!parsed) throw new Error("legal-documents-invalid")
  return parsed
}

export function useRegistrationLegalDocuments(locale: AppLanguage): LegalDocumentsState {
  const [state, setState] = useState<LegalDocumentsState>({
    locale,
    acceptances: null,
    loading: true,
    failed: false,
  })

  useEffect(() => {
    let active = true
    void loadRegistrationLegalDocuments(locale)
      .then(acceptances => {
        if (active) setState({ locale, acceptances, loading: false, failed: false })
      })
      .catch(() => {
        if (active) setState({ locale, acceptances: null, loading: false, failed: true })
      })
    return () => { active = false }
  }, [locale])

  return state.locale === locale
    ? state
    : { locale, acceptances: null, loading: true, failed: false }
}
