"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { useLocale, useTranslations } from "next-intl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, ChevronDown, X } from "lucide-react"
import { ACCOUNT_COUNTRIES } from "@lospor/core/account"
import { AuthFrame } from "@/components/auth/AuthFrame"
import { AuthenticationSelfServiceBoundary } from "@/components/auth/AuthenticationSelfServiceBoundary"
import { PasswordStrength } from "@/components/auth/PasswordStrength"
import { registrationErrorKey } from "@/lib/public-api-errors"
import {
  publicRegistrationInstitutions,
  publicRegistrationPayload,
  publicRegistrationSchema,
  type PublicInstitution,
  type PublicRegistrationForm,
} from "@/lib/public-registration"
import { DEFAULT_LOCALE, parseLocale } from "@/i18n/locales"
import { useRegistrationLegalDocuments } from "@/hooks/useRegistrationLegalDocuments"


const COUNTRIES = ACCOUNT_COUNTRIES

type FormData = PublicRegistrationForm
type Institution = PublicInstitution

// ── Searchable institution picker ─────────────────────────────────────────────
function InstitutionPicker({
  institutions, value, onChange, placeholder, disabled,
}: {
  institutions: Institution[]
  value: string
  onChange: (id: string) => void
  placeholder: string
  disabled?: boolean
}) {
  const t = useTranslations()
  const [open,   setOpen]   = useState(false)
  const [query,  setQuery]  = useState("")
  const wrapRef             = useRef<HTMLDivElement>(null)
  const inputRef            = useRef<HTMLInputElement>(null)

  const selected = institutions.find(i => i.id === value)

  const filtered = query.trim()
    ? institutions.filter(i =>
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        i.city.toLowerCase().includes(query.toLowerCase()))
    : institutions

  useEffect(() => {
    if (!open) return
    setTimeout(() => inputRef.current?.focus(), 50)
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-sm text-left transition-colors
          ${disabled ? "opacity-40 cursor-not-allowed bg-slate-50 dark:bg-[#1a1a1a] border-slate-200 dark:border-[#2a2a2a]"
                     : "bg-white dark:bg-[#1c1c1c] border-slate-200 dark:border-[#3a3a3a] hover:border-slate-300 dark:hover:border-[#555] cursor-pointer"}
          ${open ? "ring-2 ring-blue-500 border-blue-400 dark:border-blue-500" : ""}`}>
        <span className={`break-words min-w-0 flex-1 leading-snug ${selected ? "text-slate-800 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>
          {selected ? `${selected.name} — ${selected.city}` : placeholder}
        </span>
        {selected
          ? <X className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" onClick={e => { e.stopPropagation(); onChange(""); setQuery("") }} />
          : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
        }
      </button>

      {/* The panel is sized to the field, never to the viewport.
          It carried `minWidth: min(640px, 90vw)`, meant to give long hospital
          names room on a desktop. On a phone 90vw is wider than the card the
          field sits in, so the panel — anchored at left-0 — spilled past the
          card and off the screen. That gave the whole page horizontal scroll,
          and the form appeared with its labels sliced off down the left. It
          only widens now from the `sm` breakpoint up, where there is room. */}
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-xl border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1c1c1c] shadow-xl overflow-hidden sm:min-w-[min(640px,calc(100vw-3rem))] sm:max-w-[640px]">
          {/* Search bar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-[#2a2a2a]">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
              placeholder={t("auth.searchInstitution")}
              className="flex-1 text-sm bg-transparent outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400" />
            {query && <X className="h-3.5 w-3.5 text-slate-400 cursor-pointer" onClick={() => setQuery("")} />}
          </div>

          {/* List */}
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500 text-center">{t("auth.noInstitutionsFound")}</p>
            ) : (
              filtered.map(inst => (
                <button key={inst.id} type="button"
                  onClick={() => { onChange(inst.id); setOpen(false); setQuery("") }}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-[#242424] transition-colors
                    ${inst.id === value ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium" : "text-slate-800 dark:text-slate-200"}`}>
                  {/* min-w-0 is what makes `truncate` work here. A flex item
                      defaults to min-width:auto, so it refuses to shrink below
                      its own text — and Bulgarian hospital names are long
                      enough that every row forced itself wider than the panel
                      rather than ellipsing. */}
                  <span className="truncate min-w-0">{inst.name}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{inst.city}</span>
                </button>
              ))
            )}
          </div>

          <div className="px-3 py-1.5 border-t border-slate-100 dark:border-[#2a2a2a] text-[10px] text-slate-400 dark:text-slate-500">
            {t("auth.institutionCount", { shown: filtered.length, total: institutions.length })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RegisterPage() {
  return (
    <AuthenticationSelfServiceBoundary service="registration">
      <PublicRegistrationPage />
    </AuthenticationSelfServiceBoundary>
  )
}

function PublicRegistrationPage() {
  const router  = useRouter()
  const t       = useTranslations()
  const locale  = parseLocale(useLocale()) ?? DEFAULT_LOCALE
  const [loading, setLoading]           = useState(false)
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [institutionsLoading, setInstitutionsLoading] = useState(true)
  const [institutionsFailed, setInstitutionsFailed] = useState(false)
  const {
    acceptances: legalAcceptances,
    loading: legalLoading,
    failed: legalFailed,
  } = useRegistrationLegalDocuments(locale)
  const [pwValue, setPwValue]           = useState("")
  const [country,  setCountry]  = useState("")
  const [instId,   setInstId]   = useState("")

  useEffect(() => {
    let cancelled = false
    fetch("/api/institutions", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async response => {
        if (!response.ok) throw new Error("institutions unavailable")
        const body: unknown = await response.json()
        if (!Array.isArray(body)) throw new Error("invalid institution response")
        return body as Institution[]
      })
      .then(values => {
        if (!cancelled) setInstitutions(values)
      })
      .catch(() => {
        if (!cancelled) setInstitutionsFailed(true)
      })
      .finally(() => {
        if (!cancelled) setInstitutionsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    // The runtime schema is authoritative; react-hook-form's generic resolver
    // currently disagrees with Zod 4's inferred input type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(publicRegistrationSchema) as any,
  })

  function handleCountryChange(c: string) {
    setCountry(c)
    setValue("country", c, { shouldValidate: true })
    setInstId("")
    setValue("institutionId", "", { shouldValidate: true })
  }

  function handleInstChange(id: string) { setInstId(id); setValue("institutionId", id) }

  async function onSubmit(data: FormData) {
    if (!legalAcceptances) {
      toast.error(t("auth.legalDocumentsUnavailable"))
      return
    }
    setLoading(true)
    try {
      const payload = publicRegistrationPayload(data, locale, legalAcceptances)
      const res = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({})) as { emailSent?: boolean }
      if (!res.ok) {
        toast.error(t(registrationErrorKey(res.status, body)))
        return
      }

      router.replace(`/login?registered=${body.emailSent === false ? "email-unavailable" : "check-email"}`)
    } catch {
      toast.error(t("auth.registrationUnavailable"))
    } finally {
      setLoading(false)
    }
  }

  const eligibleInstitutions = publicRegistrationInstitutions(institutions)
  const countryLabels = t.raw("auth.countries") as Record<string, string>

  return (
    <AuthFrame wide>
        <Card>
          <CardHeader>
            <CardTitle>{t("auth.register")}</CardTitle>
            <CardDescription>{t("auth.registerDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <input type="hidden" {...register("country")} />
              <input type="hidden" {...register("institutionId")} />

              {/* Title */}
              <div className="space-y-1">
                <Label>{t("auth.title")}</Label>
                <Select onValueChange={v => setValue("title", v as string)}>
                  <SelectTrigger><SelectValue placeholder={t("auth.selectTitle")} /></SelectTrigger>
                  <SelectContent>
                    {(t.raw("auth.titles") as string[]).map(tt => <SelectItem key={tt} value={tt}>{tt}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Name */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("auth.firstName")} <span className="text-red-500">*</span></Label>
                  <Input autoComplete="given-name" placeholder={t("auth.firstNamePlaceholder")} {...register("firstName")} />
                  {errors.firstName && <p className="text-xs text-red-500">{t("common.required")}</p>}
                </div>
                <div className="space-y-1">
                  <Label>{t("auth.lastName")} <span className="text-red-500">*</span></Label>
                  <Input autoComplete="family-name" placeholder={t("auth.lastNamePlaceholder")} {...register("lastName")} />
                  {errors.lastName && <p className="text-xs text-red-500">{t("common.required")}</p>}
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <Label>{t("auth.email")} <span className="text-red-500">*</span></Label>
                <Input type="email" autoComplete="email" placeholder={t("auth.emailPlaceholder")} {...register("email")} />
                {errors.email && <p className="text-xs text-red-500">{t("auth.emailInvalid")}</p>}
              </div>

              {/* Country */}
              <div className="space-y-1">
                <Label>{t("auth.country")} <span className="text-red-500">*</span></Label>
                <Select value={country} onValueChange={v => handleCountryChange(v as string)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("auth.selectCountry")}>
                      {country ? (countryLabels[country] ?? country) : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map(c => <SelectItem key={c} value={c}>{countryLabels[c] ?? c}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.country && <p className="text-xs text-red-500">{t("auth.countryRequired")}</p>}
              </div>

              {/* Institution — required, shown after country is selected */}
              {country && (
                <div className="space-y-1">
                  <Label>{t("auth.institution")} <span className="text-red-500">*</span></Label>
                  {institutionsLoading ? (
                    <p className="text-sm text-slate-500">{t("auth.loadingInstitutions")}</p>
                  ) : institutionsFailed ? (
                    <p role="alert" className="text-sm text-red-500">{t("auth.institutionsUnavailable")}</p>
                  ) : (
                    <InstitutionPicker
                      institutions={eligibleInstitutions}
                      value={instId}
                      onChange={handleInstChange}
                      placeholder={t("auth.selectInstitution")} />
                  )}
                  {errors.institutionId && <p className="text-xs text-red-500">{t("auth.institutionRequired")}</p>}
                </div>
              )}

              {/* Password */}
              <div className="space-y-1">
                <Label>{t("auth.password")} <span className="text-red-500">*</span></Label>
                <Input type="password" autoComplete="new-password" {...register("password")}
                  onChange={e => { register("password").onChange(e); setPwValue(e.target.value) }} />
                {pwValue && <PasswordStrength value={pwValue} />}
                {errors.password && !pwValue && <p className="text-xs text-red-500">{t("auth.passwordRequired")}</p>}
              </div>

              <div className="space-y-1">
                <Label>{t("auth.confirmPassword")} <span className="text-red-500">*</span></Label>
                <Input type="password" autoComplete="new-password" {...register("confirmPassword")} />
                {errors.confirmPassword && <p className="text-xs text-red-500">{t("auth.passwordsNoMatch")}</p>}
              </div>

              {/* Terms acceptance */}
              <div className="rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-slate-50 dark:bg-[#1c1c1c] p-3 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <p className="font-medium text-slate-700 dark:text-slate-300">{t("auth.disclaimerTitle")}</p>
                <p>{t("auth.disclaimerText")}</p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" {...register("acceptedTerms")}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span>
                    {t("auth.acceptTermsBefore")}{" "}
                    <Link href="/terms" className="text-blue-600 hover:underline">{t("nav.footerTerms")}</Link>
                    {" "}{t("auth.acceptTermsBetween")}{" "}
                    <Link href="/privacy" className="text-blue-600 hover:underline">{t("nav.footerPrivacy")}</Link>.
                    {" "}<span className="text-red-500">*</span>
                  </span>
                </label>
                {errors.acceptedTerms && <p className="text-red-500">{t("auth.termsRequired")}</p>}
                {legalLoading && <p>{t("auth.loadingLegalDocuments")}</p>}
                {legalFailed && <p role="alert" className="text-red-500">{t("auth.legalDocumentsUnavailable")}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={loading || legalLoading || legalFailed}>
                {loading ? t("auth.creatingAccount") : t("auth.register")}
              </Button>
            </form>
            <p className="text-center text-sm text-slate-500 mt-4">
              {t("auth.haveAccount")}{" "}
              <Link href="/login" className="text-blue-600 hover:underline font-medium">
                {t("auth.signIn")}
              </Link>
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 dark:text-slate-600">
          <Link href="/terms" className="hover:text-slate-500 dark:hover:text-slate-400 transition-colors underline underline-offset-2">
            {t("nav.footerTerms")}
          </Link>
          {" · "}
          <Link href="/privacy" className="hover:text-slate-500 dark:hover:text-slate-400 transition-colors underline underline-offset-2">
            {t("nav.footerPrivacy")}
          </Link>
          {" · "}
          <a href="https://docs.lospor.org" target="_blank" rel="noopener noreferrer"
            className="hover:text-slate-500 dark:hover:text-slate-400 transition-colors underline underline-offset-2">
            {t("nav.footerDocs")}
          </a>
        </p>
    </AuthFrame>
  )
}
