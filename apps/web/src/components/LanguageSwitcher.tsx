"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"

export function LanguageSwitcher({ currentLocale }: { currentLocale: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  async function switchTo(locale: string) {
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    })
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex items-center gap-0.5 text-sm border border-slate-200 dark:border-[#3a3a3a] rounded-lg overflow-hidden">
      {(["en", "bg"] as const).map((locale, i) => (
        <button
          key={locale}
          onClick={() => switchTo(locale)}
          disabled={pending}
          className={`px-3 py-1.5 font-semibold tracking-wide transition-colors ${
            i > 0 ? "border-l border-slate-200 dark:border-[#3a3a3a]" : ""
          } ${
            currentLocale === locale
              ? "bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-white dark:bg-[#1c1c1c] text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a]"
          }`}
        >
          {locale === "en" ? "EN" : "БГ"}
        </button>
      ))}
    </div>
  )
}
