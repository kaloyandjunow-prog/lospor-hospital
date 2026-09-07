import { useEffect, useState } from "react"
import { parseLegalAcceptanceManifest } from "@lospor/core/legal"
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

/**
 * Reduce the public legal manifest to the exact references the registration
 * endpoint accepts. Content is deliberately not copied into the submission.
 *
 * The check is core's, shared with web: exact fingerprints against the
 * bundled cloud-demo text, well-formed and internally consistent for anything
 * else. This app used to check only the second half, so a cloud-demo manifest
 * that was well-formed but not what was reviewed -- tampered, or stale --
 * would have been accepted here and refused on the web.
 */
export function parseRegistrationLegalDocuments(
  value: unknown,
  locale: AppLanguage,
): LegalAcceptanceReference[] | null {
  return parseLegalAcceptanceManifest(value, locale) as LegalAcceptanceReference[] | null
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
