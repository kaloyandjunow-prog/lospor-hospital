"use client"

import { useState, useEffect, useMemo, useRef, useTransition } from "react"
import { Settings, Sun, Moon, X, User, LayoutList, Rows3 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { caseOutbox } from "@/lib/case-outbox"
import { useOptionLibrary } from "@/hooks/useOptionLibrary"
import { FavouritesEditor } from "@/components/intraop/FavouritesEditor"
import { displayClinicalCode } from "@/lib/clinical-display"
import { normalizeAutoFillVitalsPreferences } from "@lospor/core/intraop-vitals"
import {
  patchWebClinicalPreferences,
  syncWebClinicalPreferences,
} from "@/lib/clinical-preferences-web"
import {
  canonicalizeOptionPreferences,
  resolveOptionPreferenceLabels,
} from "@lospor/core/option-contracts"

type Category = "ui" | "units" | "automation" | "access" | "privacy"

function PillGroup({ options, value, onChange }: {
  options: { value: string; label: string; icon?: React.ReactNode }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg border text-xs font-semibold transition-all ${
            value === o.value
              ? "bg-slate-800 dark:bg-slate-200 border-slate-700 dark:border-slate-300 text-white dark:text-slate-900"
              : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-[#555]"
          }`}>
          {o.icon && <span className="shrink-0">{o.icon}</span>}
          {o.label}
        </button>
      ))}
    </div>
  )
}

function SettingRow({ label, description, children }: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="py-3.5 border-b border-slate-100 dark:border-[#2a2a2a] last:border-0">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</p>
          {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{description}</p>}
        </div>
        <div className="shrink-0 mt-0.5">{children}</div>
      </div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)} aria-checked={value} role="switch"
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
        value ? "bg-blue-600" : "bg-slate-200 dark:bg-[#3a3a3a]"
      }`}>
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
        value ? "translate-x-5" : "translate-x-1"
      }`} />
    </button>
  )
}

type RoleReq = { id: string; status: string; requestedAt: string; resolvedAt: string | null } | null

export function SettingsMenu({ userName, institutionName, currentLocale, role, lastLoginAt }: {
  userName?: string | null
  institutionName?: string | null
  currentLocale?: string
  role?: string
  lastLoginAt?: string | null
}) {
  const t = useTranslations()
  const [open, setOpen]                     = useState(false)
  const [modalOpen, setModalOpen]           = useState(false)
  const [category, setCategory]             = useState<Category>("ui")
  const [instEdit, setInstEdit]             = useState(false)
  const [instList, setInstList]             = useState<{ id: string; name: string; city: string }[]>([])
  const [instQuery, setInstQuery]           = useState("")
  const [instSaving, setInstSaving]         = useState(false)
  const [currentInstName, setCurrentInstName] = useState(institutionName ?? "")
  const [dark, setDark]             = useState(false)
  const [layoutMode, setLayoutMode] = useState<"tabs" | "scroll">("scroll")
  const [preopLayout, setPreopLayout] = useState<"tabs" | "scroll">("scroll")
  const [ttLayout, setTtLayout]     = useState<"expand" | "scroll">("scroll")
  const [defMon, setDefMon]         = useState<"standard" | "advanced">("standard")
  const [vitalsExp, setVitalsExp]   = useState(true)
  const [autoFill, setAutoFill]     = useState(false)
  const [autoFillBP, setAutoFillBP] = useState(false)
  const [autoFillBg, setAutoFillBg] = useState(false)
  const [locale, setLocale]         = useState(currentLocale ?? "en")
  const [exporting, setExporting]   = useState(false)
  const [exportError, setExportError] = useState("")

  // Intraop favourites. Server-side (not localStorage like the toggles above)
  // because the whole point is that they follow the clinician onto the phone.
  const { options: drugLibOpts }     = useOptionLibrary("INTRAOP_DRUG")
  const { options: infusionLibOpts } = useOptionLibrary("INTRAOP_INFUSION")
  const favDrugOptions     = useMemo(() => [...new Set(drugLibOpts.map(o => o.label))].sort(), [drugLibOpts])
  const favInfusionOptions = useMemo(() => [...new Set(infusionLibOpts.map(o => o.label))].sort(), [infusionLibOpts])
  const [favDrugs, setFavDrugs]         = useState<string[]>([])
  const [favInfusions, setFavInfusions] = useState<string[]>([])
  const [favSaving, setFavSaving]       = useState(false)
  const selectedFavDrugs = useMemo(
    () => resolveOptionPreferenceLabels(
      "INTRAOP_DRUG",
      drugLibOpts,
      favDrugs,
    ),
    [drugLibOpts, favDrugs],
  )
  const selectedFavInfusions = useMemo(
    () => resolveOptionPreferenceLabels(
      "INTRAOP_INFUSION",
      infusionLibOpts,
      favInfusions,
    ),
    [infusionLibOpts, favInfusions],
  )

  async function saveFavourites(
    key: "intraopFavouriteDrugs" | "intraopFavouriteInfusions",
    next: string[],
    apply: (v: string[]) => void,
  ) {
    const previous = key === "intraopFavouriteDrugs" ? favDrugs : favInfusions
    next = key === "intraopFavouriteDrugs"
      ? canonicalizeOptionPreferences("INTRAOP_DRUG", drugLibOpts, next)
      : canonicalizeOptionPreferences(
          "INTRAOP_INFUSION",
          infusionLibOpts,
          next,
        )
    apply(next)                     // optimistic — the list is small and local
    setFavSaving(true)
    try {
      await patchWebClinicalPreferences({ [key]: next })
    } catch {
      apply(previous)               // put it back rather than lie about saving
    } finally {
      setFavSaving(false)
    }
  }
  // Display-only — the database always stores the canonical value
  // (cm/kg/°C/mmHg); these just convert what's shown/typed in vitals entry.
  // Drugs, infusions, fluids, and labs are not affected.
  const [heightUnit, setHeightUnitState]           = useState<"cm" | "in">("cm")
  const [weightUnit, setWeightUnitState]           = useState<"kg" | "lb">("kg")
  const [temperatureUnit, setTemperatureUnitState] = useState<"C" | "F">("C")
  const [etco2Unit, setEtco2UnitState]             = useState<"mmHg" | "kPa">("mmHg")
  const [, startLangTrans]          = useTransition()
  const [roleReq, setRoleReq]       = useState<RoleReq | undefined>(undefined)
  const [reqLoading, setReqLoading] = useState(false)
  const router   = useRouter()
  const menuRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time mount sync
       reading many localStorage preference keys into matching state; none of
       these need cross-tab live updates via useSyncExternalStore, they're
       just the initial-render values (localStorage isn't readable during SSR). */
    const storedTheme = localStorage.getItem("theme")
    const isDark = storedTheme !== "light" // default to dark when nothing stored
    setDark(isDark)
    document.documentElement.classList.toggle("dark", isDark)
    if (!storedTheme) document.cookie = "theme=dark; path=/; max-age=31536000; SameSite=Lax"

    const lm = localStorage.getItem("layoutMode")
    if (lm === "tabs" || lm === "scroll") setLayoutMode(lm)

    const pl = localStorage.getItem("preopLayout")
    if (pl === "tabs" || pl === "scroll") setPreopLayout(pl)

    const tt = localStorage.getItem("timetableLayout")
    if (tt === "expand" || tt === "scroll") setTtLayout(tt)

    const dm = localStorage.getItem("defaultMonitoring")
    if (dm === "standard" || dm === "advanced") setDefMon(dm as "standard" | "advanced")

    setVitalsExp(localStorage.getItem("vitalsExpanded") !== "false")
    const autoFillPreferences = normalizeAutoFillVitalsPreferences({
      enabled: localStorage.getItem("autoFillVitals") === "on",
      includeBloodPressure: localStorage.getItem("autoFillBP") === "on",
      backfillOnReopen: localStorage.getItem("autoFillBackground") === "on",
    })
    setAutoFill(autoFillPreferences.enabled)
    setAutoFillBP(autoFillPreferences.includeBloodPressure)
    setAutoFillBg(autoFillPreferences.backfillOnReopen)

    const hu = localStorage.getItem("heightUnit")
    if (hu === "cm" || hu === "in") setHeightUnitState(hu)
    const wu = localStorage.getItem("weightUnit")
    if (wu === "kg" || wu === "lb") setWeightUnitState(wu)
    const tu = localStorage.getItem("temperatureUnit")
    if (tu === "C" || tu === "F") setTemperatureUnitState(tu)
    const eu = localStorage.getItem("etco2Unit")
    if (eu === "mmHg" || eu === "kPa") setEtco2UnitState(eu)

    void syncWebClinicalPreferences().then(preferences => {
      setDefMon(preferences.defaultMonitoring)
      setAutoFill(preferences.autoFillVitals.enabled)
      setAutoFillBP(preferences.autoFillVitals.includeBloodPressure)
      setAutoFillBg(preferences.autoFillVitals.backfillOnReopen)
      setHeightUnitState(preferences.units.height)
      setWeightUnitState(preferences.units.weight)
      setTemperatureUnitState(preferences.units.temperature)
      setEtco2UnitState(preferences.units.etco2)
      setFavDrugs(preferences.intraopFavouriteDrugs)
      setFavInfusions(preferences.intraopFavouriteInfusions)
    }).catch(() => {})

    // Fetch role request status for non-admin users
    if (role === "MEMBER" || role === "CLINICIAN" || role === "RESEARCHER" || role === "HEAD_OF_DEPT") {
      fetch("/api/role-request").then(r => r.json()).then(setRoleReq).catch(() => setRoleReq(null))
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [role])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  function setSetting(key: string, value: string) {
    localStorage.setItem(key, value)
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }))
  }

  function applyTheme(next: boolean) {
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    setSetting("theme", next ? "dark" : "light")
    document.cookie = `theme=${next ? "dark" : "light"}; path=/; max-age=31536000; SameSite=Lax`
  }
  function applyLayout(mode: "tabs" | "scroll") { setLayoutMode(mode); setSetting("layoutMode", mode) }
  function applyPreopLayout(mode: "tabs" | "scroll") { setPreopLayout(mode); setSetting("preopLayout", mode) }
  function applyTtLayout(mode: "expand" | "scroll") { setTtLayout(mode); setSetting("timetableLayout", mode) }
  function applyDefMon(mode: "standard" | "advanced") {
    setDefMon(mode)
    void patchWebClinicalPreferences({ defaultMonitoring: mode })
  }
  function applyVitalsExp(val: boolean) { setVitalsExp(val); setSetting("vitalsExpanded", val ? "true" : "false") }
  function applyAutoFill(val: boolean) {
    setAutoFill(val)
    if (!val) {
      setAutoFillBP(false)
      setAutoFillBg(false)
    }
    void patchWebClinicalPreferences({
      autoFillVitals: {
        enabled: val,
        includeBloodPressure: val ? autoFillBP : false,
        backfillOnReopen: val ? autoFillBg : false,
      },
    })
  }
  function applyAutoFillBP(val: boolean) {
    setAutoFillBP(val)
    void patchWebClinicalPreferences({ autoFillVitals: { includeBloodPressure: val } })
  }
  function applyAutoFillBg(val: boolean) {
    setAutoFillBg(val)
    void patchWebClinicalPreferences({ autoFillVitals: { backfillOnReopen: val } })
  }
  function applyHeightUnit(u: "cm" | "in") {
    setHeightUnitState(u)
    void patchWebClinicalPreferences({ units: { height: u } })
  }
  function applyWeightUnit(u: "kg" | "lb") {
    setWeightUnitState(u)
    void patchWebClinicalPreferences({ units: { weight: u } })
  }
  function applyTemperatureUnit(u: "C" | "F") {
    setTemperatureUnitState(u)
    void patchWebClinicalPreferences({ units: { temperature: u } })
  }
  function applyEtco2Unit(u: "mmHg" | "kPa") {
    setEtco2UnitState(u)
    void patchWebClinicalPreferences({ units: { etco2: u } })
  }

  async function switchLocale(l: string) {
    setLocale(l)
    await fetch("/api/locale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: l }) })
    startLangTrans(() => router.refresh())
  }

  const isMember = role === "MEMBER" || role === "CLINICIAN" || role === "RESEARCHER"
  const isHOD    = role === "HEAD_OF_DEPT"

  async function submitRoleRequest() {
    setReqLoading(true)
    try {
      const res  = await fetch("/api/role-request", { method: "POST" })
      const text = await res.text()
      const data = text ? JSON.parse(text) : null
      if (res.ok && data) setRoleReq(data)
    } catch (e) {
      console.error("Role request error:", e)
    } finally {
      setReqLoading(false)
    }
  }

  async function downloadPersonalExport() {
    setExporting(true)
    setExportError("")
    try {
      const response = await fetch("/api/user/export", { cache: "no-store" })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error || t("settings.exportDataError"))
      }
      const disposition = response.headers.get("content-disposition") ?? ""
      const filename = disposition.match(/filename="?([^"]+)"?/i)?.[1] ?? "lospor-export.zip"
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : t("settings.exportDataError"))
    } finally {
      setExporting(false)
    }
  }

  const CATS: { id: Category; label: string }[] = [
    { id: "ui",         label: t("settings.cats.ui")         },
    { id: "units",      label: t("settings.cats.units")        },
    { id: "automation", label: t("settings.cats.automation")  },
    ...(role !== "ADMIN" ? [{ id: "access" as Category, label: t("settings.cats.access") }] : []),
    { id: "privacy",    label: t("settings.cats.privacy")    },
  ]

  const [deleteConfirm, setDeleteConfirm] = useState("")
  const [deleting, setDeleting]           = useState(false)

  // Offline save tray (IndexedDB) — count shown/cleared from the privacy tab
  const [queuedSaves, setQueuedSaves] = useState<number | null>(null)
  useEffect(() => {
    if (!modalOpen || category !== "privacy") return
    caseOutbox.summary().then(s => setQueuedSaves(s.count)).catch(() => setQueuedSaves(null))
  }, [modalOpen, category])

  // Load the saved favourites when the automation tab is actually opened —
  return (
    <>
      <div className="relative" ref={menuRef}>
        <button type="button" onClick={() => setOpen(v => !v)} title={t("settings.accountSettings")}
          className={`p-2 rounded-lg transition-colors ${
            open
              ? "bg-slate-100 dark:bg-[#2a2a2a] text-slate-700 dark:text-slate-200"
              : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2a2a2a]"
          }`}>
          <Settings className="h-4 w-4" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1c1c1c] shadow-xl z-50 overflow-hidden">
            {(userName || currentInstName) && (
              <div className="px-4 py-3 border-b border-slate-100 dark:border-[#2a2a2a] space-y-1">
                {userName && <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{userName}</p>}
                {!instEdit ? (
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{currentInstName || t("settings.noInstitution")}</p>
                    <button type="button" onClick={async () => {
                      if (!instList.length) {
                        const data = await fetch("/api/institutions").then(r => r.json())
                        setInstList(data)
                      }
                      setInstEdit(true)
                    }} className="text-[10px] text-blue-500 hover:underline shrink-0">{t("settings.edit")}</button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <input value={instQuery} onChange={e => setInstQuery(e.target.value)}
                      placeholder={t("settings.searchInstitution")}
                      className="w-full text-xs rounded border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1c1c1c] px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <div className="max-h-28 overflow-y-auto rounded border border-slate-100 dark:border-[#2a2a2a]">
                      {(instQuery
                        ? instList.filter(i => i.name.toLowerCase().includes(instQuery.toLowerCase()) || i.city.toLowerCase().includes(instQuery.toLowerCase()))
                        : instList
                      ).slice(0, 20).map(inst => (
                        <button key={inst.id} type="button" disabled={instSaving}
                          onClick={async () => {
                            setInstSaving(true)
                            await fetch("/api/user", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ institutionId: inst.id }) })
                            setCurrentInstName(`${inst.name} — ${inst.city}`)
                            setInstEdit(false)
                            setInstQuery("")
                            setInstSaving(false)
                          }}
                          className="w-full text-left px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#242424]">
                          {inst.name} <span className="text-slate-400">{inst.city}</span>
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => { setInstEdit(false); setInstQuery("") }}
                      className="text-[10px] text-slate-400 hover:text-slate-600">{t("settings.cancel")}</button>
                  </div>
                )}
              </div>
            )}
            <div className="py-1">
              <button type="button" disabled
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 dark:text-[#555] cursor-not-allowed select-none">
                <User className="h-4 w-4" /> {t("settings.viewProfile")}
              </button>
              <button type="button"
                onClick={() => { setOpen(false); setModalOpen(true) }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
                <Settings className="h-4 w-4" /> {t("settings.title")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Settings modal ──────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setModalOpen(false)}>
          {/* Proper dialog semantics: screen readers announce it as a modal,
              and the onboarding tour uses the same signal to hold off rather
              than popping up on top of an open dialog. */}
          <div role="dialog" aria-modal="true" aria-label={t("settings.accountSettings")}
            className="bg-white dark:bg-[#1c1c1c] rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] flex overflow-hidden"
            onClick={e => e.stopPropagation()}>

            {/* Sidebar */}
            <div className="w-40 shrink-0 bg-slate-50 dark:bg-[#161616] border-r border-slate-200 dark:border-[#2a2a2a] py-5">
              <p className="px-4 text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">{t("settings.title")}</p>
              {CATS.map(cat => (
                <button key={cat.id} type="button" onClick={() => setCategory(cat.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                    category === cat.id
                      ? "bg-white dark:bg-[#242424] text-slate-900 dark:text-white border-r-2 border-blue-600"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-[#1e1e1e]"
                  }`}>
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#2a2a2a] shrink-0">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  {CATS.find(c => c.id === category)?.label}
                </h2>
                <button type="button" onClick={() => setModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6">
                {category === "ui" && (
                  <>
                    <SettingRow label={t("settings.theme")}>
                      <PillGroup value={dark ? "dark" : "light"} onChange={v => applyTheme(v === "dark")}
                        options={[
                          { value: "light", label: t("settings.themeLight"), icon: <Sun className="h-3 w-3" /> },
                          { value: "dark",  label: t("settings.themeDark"),  icon: <Moon className="h-3 w-3" /> },
                        ]} />
                    </SettingRow>

                    <SettingRow label={t("settings.language")}>
                      <PillGroup value={locale} onChange={switchLocale}
                        options={[
                          { value: "en", label: "EN" },
                          { value: "bg", label: "БГ" },
                        ]} />
                    </SettingRow>

                    <SettingRow label={t("settings.preopFormLayout")} description={t("settings.preopFormLayoutDesc")}>
                      <PillGroup value={preopLayout} onChange={v => applyPreopLayout(v as "tabs" | "scroll")}
                        options={[
                          { value: "tabs",   label: t("settings.layoutTabbed"), icon: <LayoutList className="h-3 w-3" /> },
                          { value: "scroll", label: t("settings.layoutScroll"), icon: <Rows3 className="h-3 w-3" /> },
                        ]} />
                    </SettingRow>

                    <SettingRow label={t("settings.formLayout")} description={t("settings.formLayoutDesc")}>
                      <PillGroup value={layoutMode} onChange={v => applyLayout(v as "tabs" | "scroll")}
                        options={[
                          { value: "tabs",   label: t("settings.layoutTabbed"), icon: <LayoutList className="h-3 w-3" /> },
                          { value: "scroll", label: t("settings.layoutScroll"), icon: <Rows3 className="h-3 w-3" /> },
                        ]} />
                    </SettingRow>

                    <SettingRow label={t("settings.timetableLayout")} description={t("settings.timetableLayoutDesc")}>
                      <PillGroup value={ttLayout} onChange={v => applyTtLayout(v as "expand" | "scroll")}
                        options={[
                          { value: "expand", label: t("settings.layoutStacked")    },
                          { value: "scroll", label: t("settings.layoutScrollable") },
                        ]} />
                    </SettingRow>

                    <SettingRow label={t("settings.defaultMonitoring")} description={t("settings.defaultMonitoringDesc")}>
                      <PillGroup value={defMon} onChange={v => applyDefMon(v as "standard" | "advanced")}
                        options={[
                          { value: "standard", label: t("settings.monitoringStandard") },
                          { value: "advanced", label: t("settings.monitoringAdvanced") },
                        ]} />
                    </SettingRow>

                    <SettingRow label={t("settings.vitalsChart")} description={t("settings.vitalsChartDesc")}>
                      <Toggle value={vitalsExp} onChange={applyVitalsExp} />
                    </SettingRow>
                  </>
                )}

                {category === "units" && (
                  <>
                    <p className="text-xs text-slate-400 dark:text-slate-500 pt-2 pb-1 leading-relaxed">
                      Display-only — values are always stored in the canonical unit. This only changes what&apos;s shown and typed in vitals entry. Drugs, infusions, fluids, and labs are unaffected.
                    </p>
                    <SettingRow label="Height">
                      <PillGroup value={heightUnit} onChange={v => applyHeightUnit(v as "cm" | "in")}
                        options={[
                          { value: "cm", label: "cm" },
                          { value: "in", label: "in" },
                        ]} />
                    </SettingRow>
                    <SettingRow label="Weight">
                      <PillGroup value={weightUnit} onChange={v => applyWeightUnit(v as "kg" | "lb")}
                        options={[
                          { value: "kg", label: "kg" },
                          { value: "lb", label: "lb" },
                        ]} />
                    </SettingRow>
                    <SettingRow label="Temperature">
                      <PillGroup value={temperatureUnit} onChange={v => applyTemperatureUnit(v as "C" | "F")}
                        options={[
                          { value: "C", label: "°C" },
                          { value: "F", label: "°F" },
                        ]} />
                    </SettingRow>
                    <SettingRow label="EtCO₂">
                      <PillGroup value={etco2Unit} onChange={v => applyEtco2Unit(v as "mmHg" | "kPa")}
                        options={[
                          { value: "mmHg", label: "mmHg" },
                          { value: "kPa",  label: "kPa" },
                        ]} />
                    </SettingRow>
                  </>
                )}

                {category === "automation" && (
                  <>
                    <SettingRow label={t("settings.autoFillVitals")} description={t("settings.autoFillVitalsDesc")}>
                      <Toggle value={autoFill} onChange={applyAutoFill} />
                    </SettingRow>
                    {autoFill && (
                      <div className="ml-4 border-l-2 border-slate-200 dark:border-[#2e2e2e] pl-4">
                        <SettingRow label={t("settings.autoFillBP")} description={t("settings.autoFillBPDesc")}>
                          <Toggle value={autoFillBP} onChange={applyAutoFillBP} />
                        </SettingRow>
                        <SettingRow label={t("settings.autoFillBackground")} description={t("settings.autoFillBackgroundDesc")}>
                          <Toggle value={autoFillBg} onChange={applyAutoFillBg} />
                        </SettingRow>
                      </div>
                    )}

                    {/* Favourite drugs / infusions — the same server-side
                        shortlist the phone edits, so it follows the clinician
                        between devices rather than living on one of them. */}
                    <div className="pt-4 mt-2 border-t border-slate-100 dark:border-[#2a2a2a] space-y-5">
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {t("settings.favouritesDesc")}
                      </p>
                      <FavouritesEditor
                        title={t("settings.favouriteDrugs")}
                        options={favDrugOptions}
                        displayOption={name => displayClinicalCode("option:INTRAOP_DRUG", name, locale, { label: name })}
                        selected={selectedFavDrugs}
                        onSave={next => saveFavourites("intraopFavouriteDrugs", next, setFavDrugs)}
                        saving={favSaving}
                        searchPlaceholder={t("settings.favouritesSearch")}
                        emptyLabel={t("settings.favouritesNoMatch")}
                      />
                      <FavouritesEditor
                        title={t("settings.favouriteInfusions")}
                        options={favInfusionOptions}
                        displayOption={name => displayClinicalCode("option:INTRAOP_INFUSION", name, locale, { label: name })}
                        selected={selectedFavInfusions}
                        onSave={next => saveFavourites("intraopFavouriteInfusions", next, setFavInfusions)}
                        saving={favSaving}
                        searchPlaceholder={t("settings.favouritesSearch")}
                        emptyLabel={t("settings.favouritesNoMatch")}
                      />
                    </div>
                  </>
                )}

                {category === "access" && (
                  <div className="py-4 space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">{t("settings.hodAccess")}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {t("settings.hodAccessDesc")}
                      </p>
                    </div>

                    {isHOD && (
                      <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3">
                        <p className="text-sm font-semibold text-green-700 dark:text-green-300">{t("settings.hodApproved")}</p>
                        {roleReq?.resolvedAt && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                            {t("settings.hodSince")} {new Date(roleReq.resolvedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                        )}
                      </div>
                    )}

                    {isMember && (() => {
                      const status = roleReq?.status

                      if (status === "PENDING") return (
                        <div className="space-y-2">
                          <button disabled
                            className="w-full py-2 px-4 rounded-lg text-sm font-semibold bg-slate-100 dark:bg-[#2a2a2a] text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-[#3a3a3a] cursor-not-allowed">
                            {t("settings.requestPending")}
                          </button>
                          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
                            {t("settings.awaitingReview")}
                          </p>
                        </div>
                      )

                      if (status === "REJECTED") return (
                        <div className="space-y-2">
                          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                            {t("settings.previousRejected")}
                          </div>
                          <button onClick={submitRoleRequest} disabled={reqLoading}
                            className="w-full py-2 px-4 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white transition-colors">
                            {reqLoading ? t("settings.submitting") : t("settings.requestHOD")}
                          </button>
                        </div>
                      )

                      return (
                        <button onClick={submitRoleRequest} disabled={reqLoading}
                          className="w-full py-2 px-4 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white transition-colors">
                          {reqLoading ? t("settings.submitting") : t("settings.requestHOD")}
                        </button>
                      )
                    })()}
                  </div>
                )}

                {category === "privacy" && (
                  <div className="space-y-4 py-2">
                    <div className="rounded-lg bg-slate-50 dark:bg-[#1a1a1a] border border-slate-100 dark:border-[#2a2a2a] px-4 py-3 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                      {lastLoginAt && (
                        <p><span className="font-medium">{t("settings.lastLogin")}</span>{" "}
                          {new Date(lastLoginAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      )}
                      <p className="text-[11px]">{t("settings.activeSessions")}</p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("settings.exportData")}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {t("settings.exportDataDesc")}
                      </p>
                      <button type="button"
                        onClick={downloadPersonalExport}
                        disabled={exporting}
                        className="mt-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors disabled:opacity-60">
                        {exporting ? t("settings.exportingData") : t("settings.downloadData")}
                      </button>
                      {exportError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{exportError}</p>}
                    </div>

                    <div className="space-y-1 border-t border-slate-100 dark:border-[#2a2a2a] pt-4">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("settings.offlineQueue")}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {t("settings.offlineQueueDesc")}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {queuedSaves && queuedSaves > 0
                            ? t("settings.offlineQueueCount", { count: queuedSaves })
                            : t("settings.offlineQueueEmpty")}
                        </span>
                        {queuedSaves !== null && queuedSaves > 0 && (
                          <button type="button"
                            onClick={async () => {
                              await caseOutbox.clearAll().catch(() => {})
                              setQueuedSaves(0)
                            }}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
                            {t("settings.clearOfflineQueue")}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 border-t border-slate-100 dark:border-[#2a2a2a] pt-4">
                      <p className="text-sm font-medium text-red-600 dark:text-red-400">{t("settings.deleteAccount")}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {t("settings.deleteAccountDesc")}
                      </p>
                      {deleting ? (
                        <p className="text-xs text-slate-400">{t("settings.deleting")}</p>
                      ) : (
                        <div className="space-y-2 mt-2">
                          <input
                            type="text" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
                            placeholder={t("settings.typeDeleteToConfirm")}
                            className="w-full text-xs rounded border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1c1c1c] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-500 text-slate-700 dark:text-slate-200"
                          />
                          <button type="button"
                            disabled={deleteConfirm !== "DELETE"}
                            onClick={async () => {
                              setDeleting(true)
                              await fetch("/api/user/delete", { method: "POST" })
                              window.location.href = "/login"
                            }}
                            className="w-full text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                            {t("settings.confirmDeletion")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
