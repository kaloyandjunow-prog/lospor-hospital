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

export default function ForgotPasswordPage() {
  const t = useTranslations()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setDevResetUrl(null)
    const res = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    setLoading(false)
    if (!res.ok && res.status !== 202) {
      toast.error(t("auth.passwordResetFailed"))
      return
    }
    const body = await res.json().catch(() => ({})) as { devResetUrl?: string }
    setDevResetUrl(body.devResetUrl ?? null)
    setSent(true)
  }

  return (
    <AuthFrame>
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.forgotPasswordTitle")}</CardTitle>
          <CardDescription>{t("auth.forgotPasswordDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <p>{t("auth.passwordResetSent")}</p>
              {devResetUrl && (
                <Link href={devResetUrl} className="block break-all text-blue-600 hover:underline">
                  {devResetUrl}
                </Link>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1">
                <Label>{t("auth.email")}</Label>
                <Input type="email" required value={email} onChange={event => setEmail(event.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("auth.sendingEmail") : t("auth.sendResetLink")}
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

