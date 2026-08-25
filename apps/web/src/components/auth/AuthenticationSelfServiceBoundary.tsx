"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { AuthFrame } from "@/components/auth/AuthFrame"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuthenticationCapability } from "@/lib/authentication-capability"

type SelfService = "registration" | "passwordRecovery"

export function AuthenticationSelfServiceBoundary({
  children,
  service,
}: {
  children: ReactNode
  service: SelfService
}) {
  const t = useTranslations()
  const { capability, loading } = useAuthenticationCapability()
  const enabled = capability && (service === "registration"
    ? capability.selfRegistration
    : capability.passwordRecovery === "EMAIL")

  if (!loading && enabled) return children

  const titleKey = loading
    ? "auth.authenticationSettingsLoadingTitle"
    : !capability
      ? "auth.authenticationSettingsUnavailableTitle"
    : service === "registration"
      ? "auth.registrationAdministratorTitle"
      : "auth.passwordRecoveryAdministratorTitle"
  const descriptionKey = loading
    ? "auth.authenticationSettingsLoading"
    : !capability
      ? "auth.authenticationSettingsUnavailable"
    : service === "registration"
      ? "auth.registrationAdministratorOnly"
      : "auth.passwordRecoveryAdministratorOnly"

  return (
    <AuthFrame>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={1}>{t(titleKey)}</CardTitle>
          <CardDescription role={loading ? "status" : !capability ? "alert" : undefined}>
            {t(descriptionKey)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!loading && (
            <p className="text-center text-sm">
              <Link href="/login" className="font-medium text-blue-600 hover:underline">
                {t("auth.backToSignIn")}
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </AuthFrame>
  )
}
