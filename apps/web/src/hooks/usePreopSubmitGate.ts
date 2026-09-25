"use client"

import { useCallback, useState, type Dispatch, type SetStateAction } from "react"
import { useLocale, useTranslations } from "next-intl"
import { fetchMissingRequiredPreop, missingRequiredPreopLabels } from "@/lib/preop-required"

type SaveOutcome = true | false | "blocked" | "queued"

export function usePreopSubmitGate(setSubmitting: Dispatch<SetStateAction<boolean>>) {
  const t = useTranslations("case")
  const locale = useLocale()
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (
    save: (onError: (message: string) => void) => Promise<SaveOutcome>,
    caseId?: () => string | null,
  ) => {
    setSubmitting(true)
    setError(null)
    try {
      const outcome = await save(setError)
      if (outcome === "queued") setError(t("preopMustReachServer"))
      if (outcome !== true) return false
      // Required preop questions are enforced here, at continue-to-intraop,
      // the step that has always held a preop back -- never on a draft save.
      const id = caseId?.()
      if (!id) return true
      const missing = await fetchMissingRequiredPreop(id)
      if (missing.length === 0) return true
      setError(t("preopRequiredMissing", { questions: missingRequiredPreopLabels(missing, locale) }))
      return false
    } finally {
      setSubmitting(false)
    }
  }, [locale, setSubmitting, t])

  return { error, run }
}
