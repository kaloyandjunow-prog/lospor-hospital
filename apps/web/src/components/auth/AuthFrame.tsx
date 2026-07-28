"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useLocale } from "next-intl"
import { Sun, Moon } from "lucide-react"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { BrandBackdrop, LosporBrand } from "@/components/LosporBrand"

export function AuthFrame({ children }: { children: ReactNode }) {
  const locale = useLocale()
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("theme")
    const isDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)
    // Hydrate the theme control from the browser preference after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(isDark)
    document.documentElement.classList.toggle("dark", isDark)
  }, [])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("theme", next ? "dark" : "light")
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#f5f7f6] dark:bg-[#090b0c] p-4 overflow-hidden">
      <BrandBackdrop />
      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <LosporBrand linked />
          <div className="mt-3 flex items-center gap-2">
            <LanguageSwitcher currentLocale={locale} />
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1c1c1c] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
