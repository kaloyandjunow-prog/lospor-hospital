"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { AuthFrame } from "@/components/auth/AuthFrame"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { passwordResetErrorKey } from "@/lib/public-api-errors"

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) {
      toast.error(t("auth.passwordResetLinkInvalid"))
      return
    }
    if (password !== confirmPassword) {
      toast.error(t("auth.passwordsNoMatch"))
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, password }),
      })
      const body: unknown = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(t(passwordResetErrorKey(res.status, body)))
        return
      }
      setDone(true)
    } catch {
      toast.error(t("auth.passwordResetUnavailable"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthFrame>
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.resetPasswordTitle")}</CardTitle>
          <CardDescription>
            {done
              ? t("auth.passwordResetComplete")
              : token
                ? t("auth.resetPasswordDesc")
                : t("auth.passwordResetLinkInvalid")}
          </CardDescription>
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
                <Label htmlFor="reset-password">{t("auth.password")}</Label>
                <Input id="reset-password" type="password" autoComplete="new-password" required value={password} onChange={event => setPassword(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reset-confirm-password">{t("auth.confirmPassword")}</Label>
                <Input id="reset-confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
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

