"use client"

import { useEffect, useState } from "react"
import type { AppLocale } from "@/i18n/locales"
import {
  parseCloudLegalAcceptances,
  type LegalAcceptanceReference,
} from "@/lib/legal-documents"

type LegalState = {
  locale: AppLocale
  acceptances: LegalAcceptanceReference[] | null
  loading: boolean
  failed: boolean
}

export function useRegistrationLegalDocuments(locale: AppLocale) {
  const [state, setState] = useState<LegalState>({
    locale,
    acceptances: null,
    loading: true,
    failed: false,
  })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/legal/documents?locale=${encodeURIComponent(locale)}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async response => {
        if (!response.ok) throw new Error("legal documents unavailable")
        const parsed = parseCloudLegalAcceptances(await response.json(), locale)
        if (!parsed) throw new Error("legal documents do not match displayed copy")
        return parsed
      })
      .then(acceptances => {
        if (!cancelled) setState({ locale, acceptances, loading: false, failed: false })
      })
      .catch(() => {
        if (!cancelled) setState({ locale, acceptances: null, loading: false, failed: true })
      })
    return () => { cancelled = true }
  }, [locale])

  return state.locale === locale
    ? state
    : { locale, acceptances: null, loading: true, failed: false }
}

