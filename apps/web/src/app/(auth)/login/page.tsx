"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { Sun, Moon } from "lucide-react"
import { BrandBackdrop, LosporBrand } from "@/components/LosporBrand"
import { AuthFrame } from "@/components/auth/AuthFrame"
import { useAuthenticationCapability } from "@/lib/authentication-capability"
import { isValidLoginUsername } from "@/lib/username-login"
import { completeLoginLocale } from "@/app/actions/locale"
import { loadAccountLocale, persistAccountLocale } from "@/lib/account-locale"

const schema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const router  = useRouter()
  const t       = useTranslations()
  const locale  = useLocale()
  const [loading, setLoading] = useState(false)
  const [dark, setDark]       = useState(false)
  const authentication = useAuthenticationCapability()

  useEffect(() => {
    const stored = localStorage.getItem("theme")
    const isDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)
    // Hydrate the theme control from the browser preference after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(isDark)
    document.documentElement.classList.toggle("dark", isDark)
  }, [])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("theme", next ? "dark" : "light")
  }

  const { register, handleSubmit } = useForm<FormData>({
    // The runtime schema is authoritative; react-hook-form's generic resolver
    // currently disagrees with Zod 4's inferred input type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
  })

  async function onSubmit(data: FormData) {
    const capability = authentication.capability
    if (!capability) return
    const usesUsername = capability.loginIdentifier === "USERNAME"
    if (usesUsername && !isValidLoginUsername(data.identifier)) {
      toast.error(t("auth.usernameInvalid"))
      return
    }
    if (!usesUsername && !z.string().email().safeParse(data.identifier).success) {
      toast.error(t("auth.emailInvalid"))
      return
    }
    setLoading(true)
    const result = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(usesUsername
        ? { username: data.identifier, password: data.password }
        : { email: data.identifier, password: data.password }),
    })
    setLoading(false)
    const body: unknown = await result.json().catch(() => ({}))
    if (!result.ok) {
      toast.error(t(usesUsername ? "auth.invalidUsernameCredentials" : "auth.invalidCredentials"))
      return
    }
    const accountPreference = await loadAccountLocale(body)
    const completed = await completeLoginLocale(accountPreference)
    if (completed.persistExplicitChoice && !await persistAccountLocale(completed.locale)) {
      toast.warning(t("locale.accountSyncFailed"))
    }
    router.push("/dashboard")
    router.refresh()
  }

  if (authentication.loading) {
    return <AuthFrame><Card><CardHeader><CardTitle>{t("auth.signIn")}</CardTitle><CardDescription role="status">{t("auth.authenticationSettingsLoading")}</CardDescription></CardHeader></Card></AuthFrame>
  }
  if (!authentication.capability) {
    return <AuthFrame><Card><CardHeader><CardTitle>{t("auth.authenticationSettingsUnavailableTitle")}</CardTitle><CardDescription role="alert">{t("auth.authenticationSettingsUnavailable")}</CardDescription></CardHeader></Card></AuthFrame>
  }
  const usesUsername = authentication.capability.loginIdentifier === "USERNAME"

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#f5f7f6] dark:bg-[#090b0c] p-4 overflow-hidden">
      <BrandBackdrop />
      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <LosporBrand />
          <div className="mt-3 flex items-center gap-2">
            <LanguageSwitcher currentLocale={locale} context="login" prominent />
            <button type="button" onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1c1c1c] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("auth.signIn")}</CardTitle>
            <CardDescription>{t(usesUsername ? "auth.signInUsernameDesc" : "auth.signInDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="login-identifier">{t(usesUsername ? "auth.username" : "auth.email")}</Label>
                <Input
                  id="login-identifier"
                  type={usesUsername ? "text" : "email"}
                  autoComplete="username"
                  placeholder={t(usesUsername ? "auth.usernamePlaceholder" : "auth.emailPlaceholder")}
                  {...register("identifier")}
                />
                {usesUsername ? <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <p>{t("auth.usernameRequirements")}</p>
                  <p>{t("auth.usernameCasePolicy")}</p>
                  <p>{t("auth.usernameDisplayNamePolicy")}</p>
                </div> : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="login-password">{t("auth.password")}</Label>
                <Input id="login-password" type="password" autoComplete="current-password" {...register("password")} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("auth.signingIn") : t("auth.signIn")}
              </Button>
            </form>

            <p className="text-center text-xs text-slate-500 mt-3">
              {authentication.capability.passwordRecovery === "EMAIL"
                ? <Link href="/forgot-password" className="text-blue-600 hover:underline font-medium">{t("auth.forgotPassword")}</Link>
                : t("auth.passwordRecoveryAdministratorOnly")}
            </p>

            <p className="text-center text-sm text-slate-500 mt-3">
              {authentication.capability.selfRegistration
                ? <Link href="/register" className="text-blue-600 hover:underline font-medium">{t("auth.register")}</Link>
                : t("auth.registrationAdministratorOnly")}
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 dark:text-slate-600">
          <a href="/terms" className="hover:text-slate-500 dark:hover:text-slate-400 transition-colors underline underline-offset-2">{t("nav.footerTerms")}</a>
          {" · "}
          <a href="/privacy" className="hover:text-slate-500 dark:hover:text-slate-400 transition-colors underline underline-offset-2">{t("nav.footerPrivacy")}</a>
          {" · "}
          <a href="https://docs.lospor.org" target="_blank" rel="noopener noreferrer"
            className="hover:text-slate-500 dark:hover:text-slate-400 transition-colors underline underline-offset-2">
            {t("nav.footerDocs")}
          </a>
        </p>
      </div>
    </div>
  )
}
