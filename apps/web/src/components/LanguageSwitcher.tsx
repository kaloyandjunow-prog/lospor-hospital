"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { selectDeviceLocale, setAccountLocale } from "@/app/actions/locale"
import type { AppLocale } from "@/i18n/locales"

export function LanguageSwitcher({
  currentLocale,
  context = "public",
  prominent = false,
}: {
  currentLocale: string
  context?: "public" | "login" | "account"
  prominent?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const t = useTranslations("locale")

  function switchTo(locale: AppLocale) {
    startTransition(async () => {
      if (context === "account") await setAccountLocale(locale)
      else await selectDeviceLocale(locale, context === "login" ? "login" : "public")
      router.refresh()
    })
  }

  return (
    <div
      role="group"
      aria-label={t("selectorLabel")}
      className={`flex items-center gap-0.5 border border-slate-300 dark:border-[#4a4a4a] rounded-lg overflow-hidden shadow-sm ${prominent ? "text-base" : "text-sm"}`}
    >
      {(["bg", "en"] as const).map((locale, i) => (
        <button
          key={locale}
          type="button"
          onClick={() => switchTo(locale)}
          disabled={pending}
          aria-pressed={currentLocale === locale}
          lang={locale}
          className={`${prominent ? "px-4 py-2" : "px-3 py-1.5"} font-semibold transition-colors ${
            i > 0 ? "border-l border-slate-200 dark:border-[#3a3a3a]" : ""
          } ${
            currentLocale === locale
              ? "bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-white dark:bg-[#1c1c1c] text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a]"
          }`}
        >
          {locale === "bg" ? "Български" : "English"}
        </button>
      ))}
    </div>
  )
}
