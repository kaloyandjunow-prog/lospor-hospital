"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { AuthFrame } from "@/components/auth/AuthFrame"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function VerifyEmailPage() {
  const t = useTranslations()
  const [status, setStatus] = useState<"checking" | "verified" | "invalid">("checking")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get("token")
    const statusParam = params.get("status")
    if (statusParam === "verified") {
      // Reflect the post-redirect status from the URL.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("verified")
      return
    }
    if (statusParam === "invalid") {
      // Reflect the post-redirect status from the URL.
      setStatus("invalid")
      return
    }
    if (token) {
      window.location.replace(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      return
    }
    // Missing token means the verification link is unusable.
    setStatus("invalid")
  }, [])

  return (
    <AuthFrame>
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.verifyEmailTitle")}</CardTitle>
          <CardDescription>
            {status === "checking" ? t("auth.verifyEmailChecking") : status === "verified" ? t("auth.verifyEmailSuccess") : t("auth.verifyEmailInvalid")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link
            href="/login"
            className="flex h-8 w-full items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            {t("auth.signIn")}
          </Link>
        </CardContent>
      </Card>
    </AuthFrame>
  )
}
