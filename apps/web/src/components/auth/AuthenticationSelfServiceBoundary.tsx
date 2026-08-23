"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { AuthFrame } from "@/components/auth/AuthFrame"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuthenticationCapability } from "@/lib/authentication-capability"

export function AuthenticationSelfServiceBoundary({
  children,
  service,
}: {
  children: ReactNode
  service: "registration" | "passwordRecovery"
}) {
  const t = useTranslations()
  const { capability, loading } = useAuthenticationCapability()
  const enabled = capability && (service === "registration"
    ? capability.selfRegistration
    : capability.passwordRecovery === "EMAIL")
  if (!loading && enabled) return children

  const unavailable = !loading && !capability
  return <AuthFrame><Card><CardHeader>
    <CardTitle>{unavailable
      ? t("auth.authenticationSettingsUnavailableTitle")
      : service === "registration" ? t("auth.registrationUnavailableTitle") : t("auth.passwordRecoveryUnavailableTitle")}</CardTitle>
    <CardDescription role={loading ? "status" : unavailable ? "alert" : undefined}>
      {loading
        ? t("auth.authenticationSettingsLoading")
        : unavailable ? t("auth.authenticationSettingsUnavailable")
          : service === "registration" ? t("auth.registrationAdministratorOnly") : t("auth.passwordRecoveryAdministratorOnly")}
    </CardDescription>
  </CardHeader><CardContent><Link href="/login" className="font-medium text-blue-600 hover:underline">{t("auth.backToSignIn")}</Link></CardContent></Card></AuthFrame>
}
