"use client"

import { useCallback, useState, type Dispatch, type SetStateAction } from "react"
import { useTranslations } from "next-intl"

type SaveOutcome = true | false | "blocked" | "queued"

export function usePreopSubmitGate(setSubmitting: Dispatch<SetStateAction<boolean>>) {
  const t = useTranslations("case")
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (
    save: (onError: (message: string) => void) => Promise<SaveOutcome>,
  ) => {
    setSubmitting(true)
    setError(null)
    try {
      const outcome = await save(setError)
      if (outcome === "queued") setError(t("preopMustReachServer"))
      return outcome === true
    } finally {
      setSubmitting(false)
    }
  }, [setSubmitting, t])

  return { error, run }
}
