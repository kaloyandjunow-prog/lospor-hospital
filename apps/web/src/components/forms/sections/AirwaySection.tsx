"use client"
import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Controller } from "react-hook-form"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import { RangeSelect } from "@/components/forms/shared/RangeSelect"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { LibraryOption } from "@/hooks/useOptionLibrary"
import { displayClinicalCode, displayOption } from "@/lib/clinical-display"
import type { Control, UseFormWatch, UseFormSetValue, UseFormRegister, Path } from "react-hook-form"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"
import { VENT_ASSISTED, VENT_CONTROLLED } from "@lospor/core/ventilation"
import {
  AIRWAY_DEVICE_REQUIRED_FIELDS,
  AIRWAY_DEVICES_WITH_SUBOPTIONS,
  DLT_SIDES,
  DLT_SIZES,
  DLT_TYPES,
  ENDOBRONCHIAL_SIZES,
  ETT_SIZES,
  LMA_SIZES,
  type AirwayDeviceWithProfile,
} from "@lospor/core/intraop"

// Device/airway-tool field names are DB-driven (OptionLibrary), not
// compile-time literals — see MonitoringSection.tsx's asPath for the same pattern.
function asPath(name: string): Path<IntraopFormFields> { return name as Path<IntraopFormFields> }

export function AirwaySection({
  control, watch, setValue, register, airwayToolOptions, airwayDeviceOptions,
  presentsIntubated, showAirway, techniquesLength, airwayOverride, setAirwayOverride,
  airwayNA, setAirwayNA, airwayExpandedDevice, setAirwayExpandedDevice, expandAirwayDevice,
}: {
  control: Control<IntraopFormFields>
  watch: UseFormWatch<IntraopFormFields>
  setValue: UseFormSetValue<IntraopFormFields>
  register: UseFormRegister<IntraopFormFields>
  airwayToolOptions: LibraryOption[]
  airwayDeviceOptions: LibraryOption[]
  presentsIntubated: boolean
  showAirway: boolean
  techniquesLength: number
  airwayOverride: boolean
  setAirwayOverride: (v: boolean) => void
  airwayNA: boolean
  setAirwayNA: (updater: (v: boolean) => boolean) => void
  airwayExpandedDevice: string | null
  setAirwayExpandedDevice: (v: string | null) => void
  expandAirwayDevice: (v: string) => void
}) {
  const t = useTranslations()
  const locale = useLocale()
  const [ventExpanded, setVentExpanded] = useState<"assisted" | "controlled" | null>(null)

  if (presentsIntubated) return null
  if (!(showAirway || !techniquesLength || airwayOverride)) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 px-1">
        <span>{t("intraop.airway.hiddenForTechnique")}</span>
        <button type="button" onClick={() => setAirwayOverride(true)}
          className="text-blue-500 hover:text-blue-700 font-semibold underline underline-offset-2">
          {t("intraop.airway.showAnyway")}
        </button>
      </div>
    )
  }

  return (
    <SectionCard title={t("intraop.airway.sectionTitle")} collapsible>
      {/* N/A toggle */}
      <div className="flex items-center gap-2">
        <button type="button"
          onClick={() => setAirwayNA(v => !v)}
          className={`text-xs font-semibold px-3 py-1 rounded-full border-2 transition-all ${
            airwayNA
              ? "bg-slate-400 border-slate-400 text-white"
              : "border-slate-300 dark:border-[#444] text-slate-400 dark:text-[#666] hover:border-slate-400 hover:text-slate-500"
          }`}>
          N/A
        </button>
        {airwayNA && <span className="text-xs text-slate-400 dark:text-[#666]">{t("intraop.airway.noAirwayIntervention")}</span>}
      </div>

      {!airwayNA && <>
      {/* Airway management instruments — multi-select */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t("intraop.airway.instrumentsLabel")}</p>
        <div className="flex flex-wrap gap-2">
          {airwayToolOptions.map(option => {
            const v = option.value
            const label = displayOption("AIRWAY_MANAGEMENT", option, locale)
            const tools: string[] = watch("airwayTools") ?? []
            const on = tools.includes(v)
            return (
              <button key={v} type="button"
                onClick={() => setValue("airwayTools", on ? tools.filter(t => t !== v) : [...tools, v])}
                className={`px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                  on ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                     : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                }`}>
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Cormack-Lehane grade — shown when direct or video laryngoscopy performed */}
      {(watch("airwayTools") ?? []).some((t: string) => ["DIRECT_LARY","VIDEO_LARY"].includes(t)) && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t("intraop.airway.cormackLehaneLabel")}</p>
          <Controller name="cormackLehane" control={control} render={({ field }) => (
            <div className="grid grid-cols-5 gap-2">
              {([
                {
                  v: "I", label: "I", color: "bg-green-500 border-green-500 dark:bg-green-700 dark:border-green-600 text-white",
                  desc: "Full glottis",
                  svg: (
                    <svg viewBox="0 0 44 32" className="w-10 h-7 mx-auto mb-1">
                      <ellipse cx="22" cy="26" rx="16" ry="5" fill="currentColor" opacity="0.2"/>
                      <path d="M22 6 L8 26 L36 26 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round"/>
                      <line x1="8" y1="26" x2="36" y2="26" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,2"/>
                    </svg>
                  ),
                },
                {
                  v: "IIa", label: "IIa", color: "bg-lime-500 border-lime-500 dark:bg-lime-700 dark:border-lime-600 text-white",
                  desc: "Posterior commissure",
                  svg: (
                    <svg viewBox="0 0 44 32" className="w-10 h-7 mx-auto mb-1">
                      <rect x="0" y="0" width="44" height="14" fill="currentColor" opacity="0.3" rx="2"/>
                      <path d="M22 14 L10 26 L34 26 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round"/>
                      <line x1="10" y1="26" x2="34" y2="26" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,2"/>
                    </svg>
                  ),
                },
                {
                  v: "IIb", label: "IIb", color: "bg-yellow-500 border-yellow-500 dark:bg-yellow-700 dark:border-yellow-600 text-white",
                  desc: "Arytenoids only",
                  svg: (
                    <svg viewBox="0 0 44 32" className="w-10 h-7 mx-auto mb-1">
                      <rect x="0" y="0" width="44" height="18" fill="currentColor" opacity="0.3" rx="2"/>
                      <path d="M22 18 L16 26 L28 26 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round"/>
                      <line x1="16" y1="26" x2="28" y2="26" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2,2"/>
                    </svg>
                  ),
                },
                {
                  v: "III", label: "III", color: "bg-orange-500 border-orange-500 dark:bg-orange-700 dark:border-orange-600 text-white",
                  desc: "Epiglottis only",
                  svg: (
                    <svg viewBox="0 0 44 32" className="w-10 h-7 mx-auto mb-1">
                      <rect x="0" y="0" width="44" height="22" fill="currentColor" opacity="0.3" rx="2"/>
                      <path d="M8 22 Q22 10 36 22" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                    </svg>
                  ),
                },
                {
                  v: "IV", label: "IV", color: "bg-red-500 border-red-500 dark:bg-red-700 dark:border-red-600 text-white",
                  desc: "No view",
                  svg: (
                    <svg viewBox="0 0 44 32" className="w-10 h-7 mx-auto mb-1">
                      <rect x="0" y="0" width="44" height="32" fill="currentColor" opacity="0.25" rx="2"/>
                      <line x1="12" y1="10" x2="32" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                      <line x1="32" y1="10" x2="12" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                    </svg>
                  ),
                },
              ] as const).map(opt => (
                <button key={opt.v} type="button"
                  onClick={() => field.onChange(field.value === opt.v ? undefined : opt.v)}
                  className={`rounded-xl border-2 p-2.5 text-center transition-all ${
                    field.value === opt.v
                      ? opt.color + " shadow-sm"
                      : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"
                  }`}>
                  {opt.svg}
                  <div className="text-sm font-bold leading-none">{opt.label}</div>
                  <div className="text-[9px] mt-1 leading-tight opacity-80">{opt.desc}</div>
                </button>
              ))}
            </div>
          )} />
        </div>
      )}

      {/* Device — multi-select; devices with sub-options only confirm (and reach the DB) once complete */}
      {(() => {
        const devs: string[] = watch("airwayDevices") ?? []
        const lmaSize       = watch("lmaSize")
        const oralTubeSize  = watch("oralTubeSize")
        const oralCuffed    = watch("oralCuffed")
        const nasalTubeSize = watch("nasalTubeSize")
        const nasalCuffed   = watch("nasalCuffed")
        const dltType  = watch("dltType")
        const dltSide  = watch("dltSide")
        const dltSize  = watch("dltSize")
        const ebSize   = watch("endobronchialSize")

        const deviceName = (code: string) => {
          const option = airwayDeviceOptions.find(candidate => candidate.value === code)
          return option
            ? displayOption("AIRWAY_MANAGEMENT", option, locale)
            : displayClinicalCode("option:AIRWAY_MANAGEMENT", code, locale)
        }

        // Summary labels for devices with sub-options when collapsed (confirmed)
        const deviceSummary: Record<string, string | null> = {
          LMA:               lmaSize != null ? `${deviceName("LMA")} ${lmaSize}` : null,
          ORAL_ETT:          oralTubeSize != null && oralCuffed != null ? `${deviceName("ORAL_ETT")} ${oralTubeSize} ${displayClinicalCode("clinicalAttribute", oralCuffed ? "cuffed" : "uncuffed", locale)}` : null,
          NASAL_ETT:         nasalTubeSize != null && nasalCuffed != null ? `${deviceName("NASAL_ETT")} ${nasalTubeSize} ${displayClinicalCode("clinicalAttribute", nasalCuffed ? "cuffed" : "uncuffed", locale)}` : null,
          DOUBLE_LUMEN_TUBE: (dltType || dltSide || dltSize != null) ? `${deviceName("DOUBLE_LUMEN_TUBE")}${dltType ? " " + dltType : ""}${dltSide ? " " + displayClinicalCode("clinicalAttribute", dltSide.toLowerCase(), locale) : ""}${dltSize != null ? " " + dltSize + "Fr" : ""}` : null,
          ENDOBRONCHIAL_TUBE:ebSize != null ? `${deviceName("ENDOBRONCHIAL_TUBE")} ${ebSize}mm` : null,
        }
        const HAS_SUBOPTIONS: readonly string[] = AIRWAY_DEVICES_WITH_SUBOPTIONS

        const DEVICES: { v: string; label: string }[] = airwayDeviceOptions.map(option => ({ v: option.value, label: displayOption("AIRWAY_MANAGEMENT", option, locale) }))

        function handleSimpleDeviceClick(v: string) {
          const isOn = devs.includes(v)
          setValue("airwayDevices", isOn ? devs.filter(d => d !== v) : [...devs, v])
        }

        // Right-click / long-press removal for devices with sub-options — clears the
        // device's own fields too, so re-adding it later starts blank, not pre-filled
        // from whatever was entered last time.
        function removeComplexDevice(v: string) {
          if (devs.includes(v)) setValue("airwayDevices", devs.filter(d => d !== v))
          if (airwayExpandedDevice === v) setAirwayExpandedDevice(null)
          for (const field of AIRWAY_DEVICE_REQUIRED_FIELDS[v as AirwayDeviceWithProfile] ?? []) {
            setValue(asPath(field), undefined)
          }
        }

        return (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t("intraop.airway.deviceLabel")}</p>
            <div className="flex flex-wrap gap-2">
              {DEVICES.map(({ v, label }) => {
                if (!HAS_SUBOPTIONS.includes(v)) {
                  const on = devs.includes(v)
                  return (
                    <button key={v} type="button" onClick={() => handleSimpleDeviceClick(v)}
                      className={`px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                        on ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                           : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                      }`}>
                      {label}
                    </button>
                  )
                }
                const confirmed = devs.includes(v)
                const summary = confirmed ? deviceSummary[v] : null
                const isExpanded = airwayExpandedDevice === v
                const inProgress = !confirmed && isExpanded
                const btnLabel = summary && !isExpanded ? summary : (inProgress ? `${label}…` : label)
                return (
                  <button key={v} type="button"
                    onClick={() => isExpanded ? setAirwayExpandedDevice(null) : expandAirwayDevice(v)}
                    onContextMenu={e => { e.preventDefault(); removeComplexDevice(v) }}
                    title={confirmed ? (isExpanded ? "Click to collapse · Right-click to remove" : "Click to edit · Right-click to remove") : "Click to fill in details"}
                    className={`px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                      confirmed
                        ? summary && !isExpanded
                          ? "bg-blue-700 border-blue-600 text-white dark:bg-blue-800 dark:border-blue-700 shadow-sm"
                          : "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                        : inProgress
                          ? "border-dashed border-blue-400 text-blue-600 dark:border-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10"
                          : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                    }`}>
                    {btnLabel}
                  </button>
                )
              })}
            </div>

            {/* Sub-option panel — LMA */}
            {airwayExpandedDevice === "LMA" && (
              <div className="rounded-lg border border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#1a1a1a] p-3 space-y-3">
                <div className="w-40 space-y-1">
                  <Label>{t("intraop.airway.lmaSize")}</Label>
                  <RangeSelect name="lmaSize" control={control} values={[...LMA_SIZES]} placeholder="— size" />
                </div>
              </div>
            )}

            {/* Sub-option panel — Oral ETT */}
            {airwayExpandedDevice === "ORAL_ETT" && (
              <div className="rounded-lg border border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#1a1a1a] p-3 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>{t("intraop.airway.tubeSizeMmId")}</Label>
                    <RangeSelect name="oralTubeSize" control={control} values={[...ETT_SIZES]} placeholder="— size" />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("intraop.airway.cuffed")}</Label>
                    <div className="flex gap-2">
                      {([{ v: true, label: "Cuffed" }, { v: false, label: "Uncuffed" }] as const).map(opt => (
                        <button key={String(opt.v)} type="button"
                          onClick={() => setValue("oralCuffed", oralCuffed === opt.v ? undefined : opt.v)}
                          className={`flex-1 text-sm py-1.5 rounded-lg border-2 font-semibold transition-all ${
                            oralCuffed === opt.v
                              ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                              : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-400"
                          }`}>{displayClinicalCode("clinicalAttribute", opt.v ? "cuffed" : "uncuffed", locale)}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-option panel — Nasal ETT */}
            {airwayExpandedDevice === "NASAL_ETT" && (
              <div className="rounded-lg border border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#1a1a1a] p-3 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>{t("intraop.airway.tubeSizeMmId")}</Label>
                    <RangeSelect name="nasalTubeSize" control={control} values={[...ETT_SIZES]} placeholder="— size" />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("intraop.airway.cuffed")}</Label>
                    <div className="flex gap-2">
                      {([{ v: true, label: "Cuffed" }, { v: false, label: "Uncuffed" }] as const).map(opt => (
                        <button key={String(opt.v)} type="button"
                          onClick={() => setValue("nasalCuffed", nasalCuffed === opt.v ? undefined : opt.v)}
                          className={`flex-1 text-sm py-1.5 rounded-lg border-2 font-semibold transition-all ${
                            nasalCuffed === opt.v
                              ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                              : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-400"
                          }`}>{displayClinicalCode("clinicalAttribute", opt.v ? "cuffed" : "uncuffed", locale)}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-option panel — Double Lumen Tube */}
            {airwayExpandedDevice === "DOUBLE_LUMEN_TUBE" && (
              <div className="rounded-lg border border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#1a1a1a] p-3 space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  {/* Type */}
                  <div className="space-y-1">
                    <Label>{t("intraop.airway.dltType")}</Label>
                    <div className="flex gap-2">
                      {DLT_TYPES.map(t => (
                        <button key={t} type="button"
                          onClick={() => setValue("dltType", dltType === t ? undefined : t)}
                          className={`flex-1 text-xs py-1.5 rounded-lg border-2 font-semibold transition-all ${
                            dltType === t
                              ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                              : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-400"
                          }`}>{t}</button>
                      ))}
                    </div>
                  </div>
                  {/* Side */}
                  <div className="space-y-1">
                    <Label>{t("intraop.airway.dltSide")}</Label>
                    <div className="flex gap-2">
                      {DLT_SIDES.map(s => (
                        <button key={s} type="button"
                          onClick={() => setValue("dltSide", dltSide === s ? undefined : s)}
                          className={`flex-1 text-xs py-1.5 rounded-lg border-2 font-semibold transition-all ${
                            dltSide === s
                              ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                              : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-400"
                          }`}>{displayClinicalCode("clinicalAttribute", s.toLowerCase(), locale, { label: s })}</button>
                      ))}
                    </div>
                  </div>
                  {/* Size pills — Fr sizes */}
                  <div className="space-y-1">
                    <Label>{t("intraop.airway.dltSizeFr")}</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {DLT_SIZES.map(sz => (
                        <button key={sz} type="button"
                          onClick={() => setValue("dltSize", dltSize === sz ? undefined : sz)}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border-2 transition-all ${
                            dltSize === sz
                              ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                              : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-400"
                          }`}>{sz}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-option panel — Endobronchial Tube */}
            {airwayExpandedDevice === "ENDOBRONCHIAL_TUBE" && (
              <div className="rounded-lg border border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#1a1a1a] p-3 space-y-3">
                <div className="space-y-1">
                  <Label>{t("intraop.airway.ebSizeMmId")}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {ENDOBRONCHIAL_SIZES.map(sz => (
                      <button key={sz} type="button"
                        onClick={() => setValue("endobronchialSize", ebSize === sz ? undefined : sz)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border-2 transition-all ${
                          ebSize === sz
                            ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                            : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-400"
                        }`}>{sz}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Ventilation — hierarchical multi-select */}
      <div className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t("intraop.airway.ventilationMode")}</p>
        <div className="flex flex-wrap gap-2">
          {/* Spontaneous */}
          {(() => {
            const modes: string[] = watch("ventilationModes") ?? []
            const on = modes.includes("Spontaneous")
            return (
              <button type="button"
                onClick={() => setValue("ventilationModes", on ? modes.filter(m => m !== "Spontaneous") : [...modes, "Spontaneous"])}
                className={`px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                  on ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                     : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                }`}>{t("intraop.airway.ventSpontaneous")}</button>
            )
          })()}
          {/* Assisted — expander */}
          {(() => {
            const modes: string[] = watch("ventilationModes") ?? []
            const hasAny = VENT_ASSISTED.some(m => modes.includes(m.v))
            const open   = ventExpanded === "assisted"
            return (
              <button type="button"
                onClick={() => setVentExpanded(open ? null : "assisted")}
                className={`px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all flex items-center gap-1 ${
                  hasAny ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                         : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                }`}>
                Assisted <span className="text-[10px]">{open ? "▲" : "▼"}</span>
              </button>
            )
          })()}
          {/* Controlled — expander */}
          {(() => {
            const modes: string[] = watch("ventilationModes") ?? []
            const hasAny = VENT_CONTROLLED.some(m => modes.includes(m.v))
            const open   = ventExpanded === "controlled"
            return (
              <button type="button"
                onClick={() => setVentExpanded(open ? null : "controlled")}
                className={`px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all flex items-center gap-1 ${
                  hasAny ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                         : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                }`}>
                Controlled <span className="text-[10px]">{open ? "▲" : "▼"}</span>
              </button>
            )
          })()}
          {/* Jet ventilation — standalone */}
          {(() => {
            const modes: string[] = watch("ventilationModes") ?? []
            const on = modes.includes("Jet")
            return (
              <button type="button"
                onClick={() => setValue("ventilationModes", on ? modes.filter(m => m !== "Jet") : [...modes, "Jet"])}
                className={`px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                  on ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                     : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                }`}>{t("intraop.airway.ventJet")}</button>
            )
          })()}
        </div>

        {/* Assisted sub-modes */}
        {ventExpanded === "assisted" && (
          <div className="flex flex-wrap gap-1.5 pl-3 border-l-2 border-slate-200 dark:border-[#3a3a3a]">
            {VENT_ASSISTED.map(({ v, label }) => {
              const modes: string[] = watch("ventilationModes") ?? []
              const on = modes.includes(v)
              return (
                <button key={v} type="button"
                  onClick={() => setValue("ventilationModes", on ? modes.filter(m => m !== v) : [...modes, v])}
                  className={`px-2.5 py-1 rounded-lg border-2 text-xs font-semibold transition-all ${
                    on ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                       : "border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-[#555]"
                  }`}>{displayClinicalCode("ventilationMode", v, locale, { label })}</button>
              )
            })}
          </div>
        )}

        {/* Controlled sub-modes */}
        {ventExpanded === "controlled" && (
          <div className="flex flex-wrap gap-1.5 pl-3 border-l-2 border-slate-200 dark:border-[#3a3a3a]">
            {VENT_CONTROLLED.map(({ v, label }) => {
              const modes: string[] = watch("ventilationModes") ?? []
              const on = modes.includes(v)
              return (
                <button key={v} type="button"
                  onClick={() => setValue("ventilationModes", on ? modes.filter(m => m !== v) : [...modes, v])}
                  className={`px-2.5 py-1 rounded-lg border-2 text-xs font-semibold transition-all ${
                    on ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white"
                       : "border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-[#555]"
                  }`}>{displayClinicalCode("ventilationMode", v, locale, { label })}</button>
              )
            })}
          </div>
        )}

      </div>

      {/* Notes */}
      <div className="space-y-1">
        <Label>{t("intraop.airway.notesLabel")}</Label>
        <Textarea {...register("airwayNotes")}
          placeholder={t("intraop.airway.notesPlaceholder")}
          rows={2} className="text-sm" />
      </div>
      </>}
    </SectionCard>
  )
}
