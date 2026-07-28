"use client"

import { createContext, useContext, type ReactNode } from "react"
import { messages, type Locale } from "@/lib/i18n"

type LocaleContextValue = {
  locale: Locale
  message: (key: keyof typeof messages.en) => string
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  message: key => messages.en[key],
})

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale
  children: ReactNode
}) {
  return (
    <LocaleContext.Provider value={{
      locale,
      message: key => messages[locale][key],
    }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}

export function LanguageButton() {
  const { locale, message } = useLocale()
  return (
    <button
      type="button"
      className="icon-button locale-button"
      title={locale === "en" ? "Switch to Bulgarian" : "Превключи на английски"}
      onClick={() => {
        const next = locale === "en" ? "bg" : "en"
        document.cookie = `lospor_database_locale=${next}; path=/; max-age=31536000; samesite=lax`
        window.location.reload()
      }}
    >
      {message("language")}
    </button>
  )
}
