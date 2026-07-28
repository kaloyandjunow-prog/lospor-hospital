"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { useTranslations, useLocale } from "next-intl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { Sun, Moon, Check, Search, ChevronDown, X } from "lucide-react"
import { BrandBackdrop, LosporBrand } from "@/components/LosporBrand"
import {
  ACCOUNT_COUNTRIES,
  passwordPolicyIssues,
} from "@lospor/core/account"
import { passwordSchema } from "@/lib/password-policy"


const COUNTRIES = ACCOUNT_COUNTRIES

const schema = z.object({
  title:           z.string().optional(),
  firstName:       z.string().min(1),
  lastName:        z.string().min(1),
  email:           z.string().email(),
  password:        passwordSchema,
  confirmPassword: z.string(),
  institutionId:   z.string().optional(),
  acceptedTerms:   z.boolean().refine(v => v === true, "You must accept the terms"),
}).refine(d => d.password === d.confirmPassword, { message: "mismatch", path: ["confirmPassword"] })

type FormData     = z.infer<typeof schema>
type Institution  = { id: string; name: string; city: string }

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

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-xl border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1c1c1c] shadow-xl overflow-hidden"
          style={{ minWidth: "min(640px, 90vw)", maxWidth: "640px" }}>
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
                  <span className="truncate">{inst.name}</span>
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

// ── Password strength checklist ───────────────────────────────────────────────
function PasswordStrength({ value }: { value: string }) {
  const t = useTranslations()
  const issues = new Set(passwordPolicyIssues(value))
  const checks = [
    { label: t("auth.pwLength"),    ok: !issues.has("too_short") },
    { label: t("auth.pwUppercase"), ok: !issues.has("missing_uppercase") },
    { label: t("auth.pwNumber"),    ok: !issues.has("missing_number") },
    { label: t("auth.pwSpecial"),   ok: !issues.has("missing_special") },
  ]
  return (
    <div className="space-y-1 pt-1">
      {checks.map(c => (
        <div key={c.label} className={`flex items-center gap-1.5 text-xs ${c.ok ? "text-green-600 dark:text-green-400" : "text-slate-400"}`}>
          <Check className={`h-3 w-3 ${c.ok ? "opacity-100" : "opacity-30"}`} />
          {c.label}
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const router  = useRouter()
  const t       = useTranslations()
  const locale  = useLocale()
  const [loading, setLoading]           = useState(false)
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [dark, setDark]                 = useState(false)
  const [pwValue, setPwValue]           = useState("")
  const [country,  setCountry]  = useState("")
  const [instId,   setInstId]   = useState("")

  useEffect(() => {
    fetch("/api/institutions").then(r => r.json()).then(setInstitutions)
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

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    // The runtime schema is authoritative; react-hook-form's generic resolver
    // currently disagrees with Zod 4's inferred input type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
  })

  function handleCountryChange(c: string) {
    setCountry(c)
    setInstId("")
    setValue("institutionId", "")
    if (c && c !== "Bulgaria") {
      const other = institutions.find(i => i.name === "Друго" || i.name === "Other / Private")
      if (other) { setInstId(other.id); setValue("institutionId", other.id) }
    }
  }

  function handleInstChange(id: string) { setInstId(id); setValue("institutionId", id) }

  async function onSubmit(data: FormData) {
    setLoading(true)
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    setLoading(false)
    if (!res.ok) { const b = await res.json(); toast.error(b.error ?? t("auth.registrationFailed")); return }
    toast.success(t("auth.registrationVerifyEmail"))
    router.push("/login")
  }

  const bgInstitutions = institutions.filter(i => i.name !== "Друго" && i.name !== "Other / Private")
  const isBulgaria     = country === "Bulgaria"

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-x-hidden bg-[#f5f7f6] dark:bg-[#090b0c] p-4">
      <BrandBackdrop />
      <div className="relative w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center text-center">
          <LosporBrand linked />
          <div className="mt-3 flex items-center gap-2">
            <LanguageSwitcher currentLocale={locale} />
            <button type="button" onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1c1c1c] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("auth.register")}</CardTitle>
            <CardDescription>{t("auth.registerDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

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
                  <Input placeholder="Ivan" {...register("firstName")} />
                  {errors.firstName && <p className="text-xs text-red-500">{t("common.required")}</p>}
                </div>
                <div className="space-y-1">
                  <Label>{t("auth.lastName")} <span className="text-red-500">*</span></Label>
                  <Input placeholder="Ivanov" {...register("lastName")} />
                  {errors.lastName && <p className="text-xs text-red-500">{t("common.required")}</p>}
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <Label>{t("auth.email")} <span className="text-red-500">*</span></Label>
                <Input type="email" placeholder="you@hospital.bg" {...register("email")} />
                {errors.email && <p className="text-xs text-red-500">{t("common.required")}</p>}
              </div>

              {/* Country */}
              <div className="space-y-1">
                <Label>{t("auth.country")} <span className="text-red-500">*</span></Label>
                <Select onValueChange={v => handleCountryChange(v as string)}>
                  <SelectTrigger><SelectValue placeholder={t("auth.selectCountry")} /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Institution — optional, shown after country is selected */}
              {country && (
                <div className="space-y-1">
                  <Label>{t("auth.institution")} <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
                  {isBulgaria ? (
                    <InstitutionPicker
                      institutions={bgInstitutions}
                      value={instId}
                      onChange={handleInstChange}
                      placeholder={t("auth.selectInstitution")} />
                  ) : (
                    <div className="rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-slate-50 dark:bg-[#1a1a1a] px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                      {t("common.other") ?? "Other"}
                    </div>
                  )}
                </div>
              )}

              {/* Password */}
              <div className="space-y-1">
                <Label>{t("auth.password")} <span className="text-red-500">*</span></Label>
                <Input type="password" {...register("password")}
                  onChange={e => { register("password").onChange(e); setPwValue(e.target.value) }} />
                {pwValue && <PasswordStrength value={pwValue} />}
                {errors.password && !pwValue && <p className="text-xs text-red-500">{t("auth.passwordRequired")}</p>}
              </div>

              <div className="space-y-1">
                <Label>{t("auth.confirmPassword")} <span className="text-red-500">*</span></Label>
                <Input type="password" {...register("confirmPassword")} />
                {errors.confirmPassword && <p className="text-xs text-red-500">{t("auth.passwordsNoMatch")}</p>}
              </div>

              {/* Terms acceptance */}
              <div className="rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-slate-50 dark:bg-[#1c1c1c] p-3 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <p className="font-medium text-slate-700 dark:text-slate-300">{t("auth.disclaimerTitle")}</p>
                <p>{t("auth.disclaimerText")}</p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" {...register("acceptedTerms")}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span>{t("auth.acceptTermsLabel")} <span className="text-red-500">*</span></span>
                </label>
                {errors.acceptedTerms && <p className="text-red-500">{String(errors.acceptedTerms.message)}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
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
      </div>
    </div>
  )
}
