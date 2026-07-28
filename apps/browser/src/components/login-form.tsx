"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { useLocale } from "./locale-provider"

export function LoginForm() {
  const router = useRouter()
  const { locale } = useLocale()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Sign in failed")
      router.replace("/overview")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="email">{locale === "bg" ? "Имейл" : "Email"}</label>
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
        <label htmlFor="password">{locale === "bg" ? "Парола" : "Password"}</label>
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
        {loading
          ? (locale === "bg" ? "Влизане..." : "Signing in...")
          : (locale === "bg" ? "Вход" : "Sign in")}
      </button>
    </form>
  )
}
