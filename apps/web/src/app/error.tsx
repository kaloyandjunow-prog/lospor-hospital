"use client"

import { useEffect } from "react"
import { useTranslations } from "next-intl"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations("pwa")
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("errorTitle")}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("errorDescription")}</p>
        <button type="button" onClick={reset} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          {t("errorRetry")}
        </button>
      </div>
    </main>
  )
}

