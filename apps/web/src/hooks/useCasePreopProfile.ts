"use client"

import { useCallback, useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import type { PreopAssessmentProfile } from "@lospor/core/preop-assessment"
import { fetchMissingRequiredPreop, missingRequiredPreopLabels } from "@/lib/preop-required"

/**
 * The preoperative profile the new-case page hands to the form, and the
 * required-question check made at continue-to-intraop.
 *
 * An existing case gets its profile with the case read (`setPreopProfile`);
 * a new case has no case read yet, so the profile is fetched on its own.
 */
export function useCasePreopProfile(isContinuing: boolean) {
  const t = useTranslations()
  const locale = useLocale()
  const [preopProfile, setPreopProfile] = useState<PreopAssessmentProfile | null>(null)

  useEffect(() => {
    if (isContinuing || preopProfile) return
    let cancelled = false
    fetch("/api/preop/profile", { cache: "no-store" })
      .then(response => response.ok ? response.json() as Promise<PreopAssessmentProfile> : null)
      .then(profile => { if (!cancelled && profile) setPreopProfile(profile) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isContinuing, preopProfile])

  // Required preop questions are enforced at continue-to-intraop, never on a
  // draft save. A read that fails reports nothing missing.
  const missingRequiredMessage = useCallback(async (caseId: string | null): Promise<string | null> => {
    const missing = caseId ? await fetchMissingRequiredPreop(caseId) : []
    return missing.length > 0
      ? t("case.preopRequiredMissing", { questions: missingRequiredPreopLabels(missing, locale) })
      : null
  }, [locale, t])

  return { preopProfile, setPreopProfile, missingRequiredMessage }
}
