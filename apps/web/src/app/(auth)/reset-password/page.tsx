"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { AuthFrame } from "@/components/auth/AuthFrame"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { passwordLinkToken } from "@/lib/hospital-account-link"

export default function ResetPasswordPage() {
  const t = useTranslations()
  const [token, setToken] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Hospital operator-issued links put their secret in the fragment. URL
    // fragments never reach Caddy/Next.js access logs. Email reset links keep
    // their existing query parameter for backward compatibility.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(passwordLinkToken(window.location.search, window.location.hash))
  }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== confirmPassword) {
      toast.error(t("auth.passwordsNoMatch"))
      return
    }
    setLoading(true)
    const res = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    })
    setLoading(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      toast.error(body.error ?? t("auth.passwordResetFailed"))
      return
    }
    setDone(true)
  }

  return (
    <AuthFrame>
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.resetPasswordTitle")}</CardTitle>
          <CardDescription>{done ? t("auth.passwordResetComplete") : t("auth.resetPasswordDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {done ? (
            <Link
              href="/login"
              className="flex h-8 w-full items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
            >
              {t("auth.signIn")}
            </Link>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1">
                <Label>{t("auth.password")}</Label>
                <Input type="password" required value={password} onChange={event => setPassword(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t("auth.confirmPassword")}</Label>
                <Input type="password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !token}>
                {loading ? t("common.saving") : t("auth.resetPassword")}
              </Button>
            </form>
          )}
          <p className="text-center text-sm text-slate-500">
            <Link href="/login" className="text-blue-600 hover:underline font-medium">{t("auth.backToSignIn")}</Link>
          </p>
        </CardContent>
      </Card>
    </AuthFrame>
  )
}
