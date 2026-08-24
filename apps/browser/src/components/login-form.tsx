"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import {
  deviceLocaleCookie,
  EXPLICIT_LOGIN_LOCALE_KEY,
  localeFromSessionUser,
  normalizeLocale,
} from "@/lib/locale"
import { useLocale } from "./locale-provider"

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter()
  const { locale, message } = useLocale()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")
    try {
      let explicitLocale: "bg" | "en" | null = null
      try {
        const stored = window.sessionStorage.getItem(EXPLICIT_LOGIN_LOCALE_KEY)
        explicitLocale = stored === "bg" || stored === "en" ? stored : null
      } catch {
        explicitLocale = null
      }
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(explicitLocale ? { locale: explicitLocale } : {}),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 401) throw new Error(message("invalidCredentials"))
        if (response.status === 429) throw new Error(message("tooManyLoginAttempts"))
        throw new Error(message("signInFailed"))
      }
      const accountLocale = localeFromSessionUser(body.user, normalizeLocale(explicitLocale, locale))
      document.cookie = deviceLocaleCookie(accountLocale)
      try {
        window.sessionStorage.removeItem(EXPLICIT_LOGIN_LOCALE_KEY)
      } catch {
        // Nothing sensitive is retained; the value expires with the browsing session.
      }
      router.replace(callbackUrl)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : message("signInFailed"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="email">{message("email")}</label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="password">{message("password")}</label>
        <input
          id="password"
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          required
        />
      </div>
      {error && <div className="notice error" role="alert">{error}</div>}
      <button className="button primary" type="submit" disabled={loading}>
        {loading ? message("signingIn") : message("signIn")}
      </button>
    </form>
  )
}
