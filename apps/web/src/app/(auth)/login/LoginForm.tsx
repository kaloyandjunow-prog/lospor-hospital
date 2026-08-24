"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { AuthFrame } from "@/components/auth/AuthFrame"
import { completeLoginLocale } from "@/app/actions/locale"
import { loadAccountLocale, persistAccountLocale } from "@/lib/account-locale"
import {
  parseAdministratorMfaChallenge,
  type AdministratorMfaChallenge,
} from "@/lib/administrator-mfa-client"
import { loginErrorKey } from "@/lib/public-api-errors"
import {
  useAuthenticationCapability,
  type AuthenticationCapability,
} from "@/lib/authentication-capability"
import { isValidLoginUsername } from "@/lib/username-login"
import { MfaLoginStep } from "./MfaLoginStep"

const emailSchema = z.object({
  identifier: z.string().email(),
  password: z.string().min(1),
})
const usernameSchema = z.object({
  identifier: z.string().refine(isValidLoginUsername),
  password: z.string().min(1),
})
type FormData = z.infer<typeof emailSchema>

type LoginFormProps = {
  callbackUrl: string
  initialErrorCode?: string
  registrationNotice?: "check-email" | "email-unavailable"
  passwordChanged?: boolean
}

export function LoginForm(props: LoginFormProps) {
  const t = useTranslations()
  const { capability, loading } = useAuthenticationCapability()
  if (loading) {
    return (
      <AuthFrame languageContext="login">
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={1}>{t("auth.signIn")}</CardTitle>
            <CardDescription role="status">{t("auth.authenticationSettingsLoading")}</CardDescription>
          </CardHeader>
        </Card>
      </AuthFrame>
    )
  }
  if (!capability) {
    return (
      <AuthFrame languageContext="login">
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={1}>{t("auth.authenticationSettingsUnavailableTitle")}</CardTitle>
            <CardDescription role="alert">{t("auth.authenticationSettingsUnavailable")}</CardDescription>
          </CardHeader>
        </Card>
      </AuthFrame>
    )
  }
  return <ConfiguredLoginForm {...props} capability={capability} />
}

function ConfiguredLoginForm({
  callbackUrl,
  initialErrorCode,
  registrationNotice,
  passwordChanged = false,
  capability,
}: LoginFormProps & { capability: AuthenticationCapability }) {
  const router = useRouter()
  const t = useTranslations()
  const [loading, setLoading] = useState(false)
  const [mfaChallenge, setMfaChallenge] = useState<AdministratorMfaChallenge | null>(null)
  const usesUsername = capability.loginIdentifier === "USERNAME"

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    // The runtime schema is authoritative; react-hook-form's generic resolver
    // currently disagrees with Zod 4's inferred input type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(usesUsername ? usernameSchema : emailSchema) as any,
  })

  async function completeSuccessfulLogin(body: unknown) {
    const accountPreference = await loadAccountLocale(body)
    const completed = await completeLoginLocale(accountPreference)
    if (
      completed.persistExplicitChoice
      && !await persistAccountLocale(completed.locale)
    ) {
      toast.warning(t("locale.accountSyncFailed"))
    }

    router.replace(callbackUrl)
    router.refresh()
  }

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const result = await fetch("/api/auth/session", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(usesUsername
          ? { username: data.identifier, password: data.password }
          : { email: data.identifier, password: data.password }),
      })
      const body: unknown = await result.json().catch(() => ({}))
      if (result.status === 202) {
        const challenge = parseAdministratorMfaChallenge(body)
        if (!challenge) {
          toast.error(t("mfa.unavailable"))
          return
        }
        reset()
        setMfaChallenge(challenge)
        return
      }
      if (!result.ok) {
        const key = loginErrorKey(result.status, body)
        toast.error(t(usesUsername && key === "auth.invalidCredentials"
          ? "auth.invalidUsernameCredentials"
          : key))
        return
      }
      await completeSuccessfulLogin(body)
    } catch {
      toast.error(t("auth.signInUnavailable"))
    } finally {
      setLoading(false)
    }
  }

  const initialError = initialErrorCode
    ? t(loginErrorKey(403, { code: initialErrorCode }))
    : null

  return (
    <AuthFrame languageContext="login">
      <Card>
        <CardHeader>
          <CardTitle>{t(mfaChallenge ? "mfa.title" : "auth.signIn")}</CardTitle>
          <CardDescription>
            {t(mfaChallenge
              ? mfaChallenge.enrollmentRequired ? "mfa.enrollmentDescription" : "mfa.description"
              : usesUsername ? "auth.signInUsernameDesc" : "auth.signInDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!mfaChallenge && passwordChanged && (
            <p role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
              {t("auth.passwordChangedSignInAgain")}
            </p>
          )}
          {!mfaChallenge && capability.selfRegistration && registrationNotice && (
            <p
              role={registrationNotice === "email-unavailable" ? "alert" : "status"}
              className={`mb-4 rounded-lg border px-3 py-2 text-sm ${registrationNotice === "email-unavailable"
                ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
                : "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300"}`}
            >
              {t(registrationNotice === "email-unavailable" ? "auth.registrationEmailFailed" : "auth.registrationVerifyEmail")}
            </p>
          )}
          {!mfaChallenge && initialError && (
            <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {initialError}
            </p>
          )}

          {mfaChallenge ? (
            <MfaLoginStep
              challenge={mfaChallenge}
              onAuthenticated={completeSuccessfulLogin}
              onStartOver={() => {
                setMfaChallenge(null)
                reset()
              }}
            />
          ) : <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1">
              <Label htmlFor="login-identifier">{t(usesUsername ? "auth.username" : "auth.email")}</Label>
              <Input
                id="login-identifier"
                type={usesUsername ? "text" : "email"}
                autoComplete="username"
                placeholder={t(usesUsername ? "auth.usernamePlaceholder" : "auth.emailPlaceholder")}
                aria-invalid={Boolean(errors.identifier)}
                aria-describedby={usesUsername
                  ? `login-username-help${errors.identifier ? " login-identifier-error" : ""}`
                  : errors.identifier ? "login-identifier-error" : undefined}
                {...register("identifier")}
              />
              {usesUsername && (
                <div id="login-username-help" className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <p>{t("auth.usernameRequirements")}</p>
                  <p>{t("auth.usernameCasePolicy")}</p>
                  <p>{t("auth.usernameDisplayNamePolicy")}</p>
                </div>
              )}
              {errors.identifier && (
                <p id="login-identifier-error" className="text-xs text-red-500">
                  {t(usesUsername ? "auth.usernameInvalid" : "auth.emailInvalid")}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="login-password">{t("auth.password")}</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? "login-password-error" : undefined}
                {...register("password")}
              />
              {errors.password && <p id="login-password-error" className="text-xs text-red-500">{t("auth.passwordRequired")}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("auth.signingIn") : t("auth.signIn")}
            </Button>
          </form>}

          {!mfaChallenge && (
            <>
              <p className="text-center text-xs text-slate-500 mt-3">
                {capability.passwordRecovery === "EMAIL" ? (
                  <Link href="/forgot-password" className="text-blue-600 hover:underline font-medium">
                    {t("auth.forgotPassword")}
                  </Link>
                ) : t("auth.passwordRecoveryAdministratorOnly")}
              </p>

              <p className="text-center text-sm text-slate-500 mt-3">
                {capability.selfRegistration ? (
                  <>
                    {t("auth.noAccount")}{" "}
                    <Link href="/register" className="text-blue-600 hover:underline font-medium">
                      {t("auth.register")}
                    </Link>
                  </>
                ) : t("auth.registrationAdministratorOnly")}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-slate-400 dark:text-slate-600">
        <Link href="/terms" className="hover:text-slate-500 dark:hover:text-slate-400 transition-colors underline underline-offset-2">{t("nav.footerTerms")}</Link>
        {" · "}
        <Link href="/privacy" className="hover:text-slate-500 dark:hover:text-slate-400 transition-colors underline underline-offset-2">{t("nav.footerPrivacy")}</Link>
        {" · "}
        <a href="https://docs.lospor.org" target="_blank" rel="noopener noreferrer"
          className="hover:text-slate-500 dark:hover:text-slate-400 transition-colors underline underline-offset-2">
          {t("nav.footerDocs")}
        </a>
      </p>
    </AuthFrame>
  )
}
