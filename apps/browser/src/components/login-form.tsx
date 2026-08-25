"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import {
  deviceLocaleCookie,
  EXPLICIT_LOGIN_LOCALE_KEY,
  localeFromSessionUser,
  normalizeLocale,
} from "@/lib/locale"
import { useAuthenticationCapability } from "@/lib/authentication-capability"
import { useLocale } from "./locale-provider"

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const { message } = useLocale()
  const { capability, loading: capabilityLoading } = useAuthenticationCapability()

  if (capabilityLoading) {
    return <p className="notice" role="status">{message("authenticationSettingsLoading")}</p>
  }
  // A missing or unrecognised capability document never falls back to a
  // guessed shape. Hospital requires usernames; posting a stray email body
  // to a username-only deployment fails anyway, but silently -- the operator
  // sees "sign-in failed" with no indication the field itself is wrong.
  if (!capability) {
    return (
      <div className="notice error" role="alert">
        <p>{message("authenticationSettingsUnavailableTitle")}</p>
        <p>{message("authenticationSettingsUnavailable")}</p>
      </div>
    )
  }
  return <ConfiguredLoginForm callbackUrl={callbackUrl} usesUsername={capability.loginIdentifier === "USERNAME"} />
}

function ConfiguredLoginForm({
  callbackUrl,
  usesUsername,
}: {
  callbackUrl: string
  usesUsername: boolean
}) {
  const router = useRouter()
  const { locale, message } = useLocale()
  const [identifier, setIdentifier] = useState("")
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
          ...(usesUsername ? { username: identifier } : { email: identifier }),
          password,
          ...(explicitLocale ? { locale: explicitLocale } : {}),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(message(usesUsername ? "invalidUsernameCredentials" : "invalidCredentials"))
        }
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
        <label htmlFor="identifier">{message(usesUsername ? "username" : "email")}</label>
        <input
          id="identifier"
          className="input"
          type={usesUsername ? "text" : "email"}
          autoComplete="username"
          placeholder={usesUsername ? message("usernamePlaceholder") : undefined}
          value={identifier}
          onChange={event => setIdentifier(event.target.value)}
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
