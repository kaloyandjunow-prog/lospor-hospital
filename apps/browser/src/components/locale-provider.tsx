"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { messages, type Locale } from "@/lib/i18n"
import {
  deviceLocaleCookie,
  EXPLICIT_LOGIN_LOCALE_KEY,
} from "@/lib/locale"

type LocaleContextValue = {
  locale: Locale
  message: (key: keyof typeof messages.en) => string
  authenticated: boolean
  changeLocale: (locale: Locale) => Promise<void>
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "bg",
  message: key => messages.bg[key],
  authenticated: false,
  changeLocale: async () => undefined,
})

export function LocaleProvider({
  initialLocale,
  authenticated,
  children,
}: {
  initialLocale: Locale
  authenticated: boolean
  children: ReactNode
}) {
  const [locale, setLocale] = useState(initialLocale)

  useEffect(() => {
    document.documentElement.lang = locale
    document.cookie = deviceLocaleCookie(locale)
  }, [locale])

  async function changeLocale(nextLocale: Locale) {
    if (nextLocale === locale) return
    if (authenticated) {
      const response = await fetch("/api/user", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences: { ui: { locale: nextLocale } } }),
      })
      if (!response.ok) throw new Error(messages[locale].languageSaveFailed)
    } else {
      try {
        window.sessionStorage.setItem(EXPLICIT_LOGIN_LOCALE_KEY, nextLocale)
      } catch {
        // The cookie still records this device-only choice when session storage is unavailable.
      }
    }
    setLocale(nextLocale)
  }

  return (
    <LocaleContext.Provider value={{
      locale,
      message: key => messages[locale][key],
      authenticated,
      changeLocale,
    }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, message, changeLocale } = useLocale()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function select(nextLocale: Locale) {
    setPending(true)
    setError("")
    try {
      await changeLocale(nextLocale)
    } catch {
      setError(message("languageSaveFailed"))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={compact ? "language-selector compact" : "language-selector"}>
      <span className="sr-only">{message("languageSelectorLabel")}</span>
      {(["bg", "en"] as const).map(option => (
        <button
          key={option}
          type="button"
          className={locale === option ? "active" : ""}
          aria-pressed={locale === option}
          disabled={pending}
          onClick={() => select(option)}
        >
          {compact
            ? option.toUpperCase()
            : option === "bg" ? "Български" : "English"}
        </button>
      ))}
      {error ? <span className="language-error" role="alert">{error}</span> : null}
    </div>
  )
}

export function LanguageButton() {
  return <LanguageSelector compact />
}
