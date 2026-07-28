"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { LosporBrand } from "@/components/LosporBrand"

export function OnboardingModal({ onAccepted }: { onAccepted: () => void }) {
  const t = useTranslations()
  const [checked,  setChecked]  = useState(false)
  const [loading,  setLoading]  = useState(false)

  async function handleAccept() {
    if (!checked) return
    setLoading(true)
    await fetch("/api/user/accept-terms", { method: "PATCH" })
    setLoading(false)
    onAccepted()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1c1c1c] shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <LosporBrand compact />
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("onboarding.title")}</h2>
        </div>

        <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <p>{t("onboarding.intro")}</p>
          <p><strong>{t("onboarding.noNames")}</strong></p>
          <p>{t("onboarding.purpose")}</p>
        </div>

        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300">
          <strong>{t("onboarding.disclaimerTitle")}</strong> — {t("onboarding.disclaimer")}
        </div>

        <label className="flex items-start gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0" />
          <span>{t("onboarding.checkboxLabel")}</span>
        </label>

        <button
          onClick={handleAccept}
          disabled={!checked || loading}
          className="w-full py-2.5 rounded-xl font-semibold text-sm transition-colors
            bg-blue-600 hover:bg-blue-700 text-white
            disabled:opacity-40 disabled:cursor-not-allowed">
          {loading ? t("onboarding.saving") : t("onboarding.continueBtn")}
        </button>
      </div>
    </div>
  )
}
