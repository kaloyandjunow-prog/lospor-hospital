"use client"

import { useMemo, useState } from "react"
import {
  ADMINISTRATION_ROUTES,
  CONCENTRATION_UNITS,
  canonicalDoseUnit,
  type AdministrationRouteCode,
  type ConcentrationUnit,
  type DoseAmountUnit,
  type DoseBodyBasis,
  type DoseTimeBasis,
} from "@lospor/core/clinical-rule-vocabulary"
import {
  DOSE_MODE,
  LOCAL_ANAESTHETIC_FORMULATIONS,
  ROUNDING,
  type DoseCalc,
  type DoseProfile,
  type LocalAnaestheticFormulation,
  type RouteMode,
  type WeightBasis,
} from "@lospor/core/catalog"
import {
  FLUID_ENTRY_MODES,
  FLUID_RATE_CALCULATIONS,
  FLUID_RATE_SLIDER,
  type FluidEntryMode,
  type FluidRateCalculation,
} from "@lospor/core/intraop-fluids"
import { useLocale } from "next-intl"
import { cloneRouteMode, doseProfileEditorIssues, effectiveRouteMode } from "@/lib/dose-profile-validation"
import { ProfilePreview, type PreviewSection } from "./ProfilePreview"

// Only the form chrome is translated. Unit codes, route codes, weight bases
// (TBW/IBW), entry modes and formulation values stay international, matching the
// clinical display layer's bgSource policy.
const COPY = {
  en: {
    fluidEntry: "Fluid entry",
    includedEntryModes: "Included entry modes",
    includedFluidEntryModes: "Included fluid entry modes",
    defaultFluidEntry: "Default fluid entry",
    rateAutofill: "Rate autofill calculation",
    none: "None",
    addIncludedRoute: "Add an included route",
    selectRoute: "Select route",
    copySurfaceFrom: "Copy the complete surface from",
    addRoute: "Add route",
    includedRoutes: "Included routes",
    makeDefault: "Make default",
    removeRoute: "Remove route",
    inheritedNote: "Inherited from the legacy base surface. The first change creates route-specific settings.",
    doseSettings: (route: string) => `${route} dose settings`,
    entryMode: "Entry mode",
    amountUnit: "Amount unit",
    bodyUnit: "Body unit",
    timeUnit: "Time unit",
    sliderMin: "Slider minimum",
    sliderMax: "Slider maximum",
    sliderStep: "Slider step",
    sliderRounding: "Slider rounding",
    quickDosePills: (unit: string) => `Quick-dose pills (comma separated, in ${unit})`,
    autofillCalculation: "Autofill calculation",
    calculation: "Calculation",
    manualOnly: "Manual only",
    perKg: "Per kg",
    perM2: "Per m2",
    flatAmount: "Flat amount",
    calculationAmount: "Calculation amount",
    weightBasis: "Weight basis",
    autofillRoundTo: "Autofill round to",
    autofillCap: "Autofill cap",
    capAtActualWeight: "Apply cap at actual weight",
    concentrationSection: "Concentration and formulation pills",
    concentrationUnit: "Concentration unit",
    concentrationPills: "Concentration pills (comma separated)",
    preselectedConcentration: "Preselected concentration",
    suggestedConcentration: "Suggested concentration",
    formulationPills: "Formulation pills",
    preselectedFormulation: "Preselected formulation",
    volumeSection: "Volume, rate and preparation",
    suggestedVolume: "Suggested volume (mL)",
    suggestedRate: "Suggested rate",
    prepAmount: "Preparation strength amount (mg)",
    prepVolume: "Preparation strength volume (mL)",
    advancedProfile: "Advanced profile (read only)",
  },
  bg: {
    fluidEntry: "Въвеждане на течности",
    includedEntryModes: "Включени режими на въвеждане",
    includedFluidEntryModes: "Включени режими за течности",
    defaultFluidEntry: "Режим по подразбиране",
    rateAutofill: "Изчисление на скоростта",
    none: "Няма",
    addIncludedRoute: "Добави път на въвеждане",
    selectRoute: "Избери път",
    copySurfaceFrom: "Копирай настройките от",
    addRoute: "Добави път",
    includedRoutes: "Включени пътища",
    makeDefault: "Направи по подразбиране",
    removeRoute: "Премахни пътя",
    inheritedNote: "Наследено от базовия профил. Първата промяна създава настройки за конкретния път.",
    doseSettings: (route: string) => `Настройки за дозиране — ${route}`,
    entryMode: "Режим на въвеждане",
    amountUnit: "Единица за количество",
    bodyUnit: "Телесна единица",
    timeUnit: "Единица за време",
    sliderMin: "Минимум на плъзгача",
    sliderMax: "Максимум на плъзгача",
    sliderStep: "Стъпка на плъзгача",
    sliderRounding: "Закръгляне на плъзгача",
    quickDosePills: (unit: string) => `Бързи дози (разделени със запетая, в ${unit})`,
    autofillCalculation: "Автоматично изчисление",
    calculation: "Изчисление",
    manualOnly: "Само ръчно",
    perKg: "На kg",
    perM2: "На m²",
    flatAmount: "Фиксирана доза",
    calculationAmount: "Стойност за изчисление",
    weightBasis: "Основа за теглото",
    autofillRoundTo: "Закръгляне на автоматичната доза",
    autofillCap: "Горна граница на автоматичната доза",
    capAtActualWeight: "Прилагай границата спрямо действителното тегло",
    concentrationSection: "Концентрации и лекарствени форми",
    concentrationUnit: "Единица за концентрация",
    concentrationPills: "Концентрации (разделени със запетая)",
    preselectedConcentration: "Предварително избрана концентрация",
    suggestedConcentration: "Предложена концентрация",
    formulationPills: "Лекарствени форми",
    preselectedFormulation: "Предварително избрана форма",
    volumeSection: "Обем, скорост и приготвяне",
    suggestedVolume: "Предложен обем (mL)",
    suggestedRate: "Предложена скорост",
    prepAmount: "Количество в приготвения разтвор (mg)",
    prepVolume: "Обем на приготвения разтвор (mL)",
    advancedProfile: "Разширен профил (само за четене)",
  },
} as const

function useDoseProfileCopy() {
  const locale = useLocale()
  return locale.startsWith("bg") ? COPY.bg : COPY.en
}

const fieldClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500 dark:border-[#3a3a3a] dark:bg-[#202020] dark:text-slate-100 dark:disabled:bg-[#161616]"
const labelClass = "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"

const AMOUNTS: DoseAmountUnit[] = ["NG", "MCG", "MG", "G", "IU", "MMOL", "MEQ", "ML"]
const BODY_BASES: DoseBodyBasis[] = ["NONE", "TBW", "IBW", "BSA_M2"]
const TIME_BASES: DoseTimeBasis[] = ["NONE", "MINUTE", "HOUR"]

const AMOUNT_DISPLAY: Record<DoseAmountUnit, string> = {
  NG: "ng",
  MCG: "mcg",
  MG: "mg",
  G: "g",
  IU: "IU",
  MMOL: "mmol",
  MEQ: "mEq",
  ML: "mL",
}

const CONCENTRATION_DISPLAY: Record<ConcentrationUnit, string> = {
  PERCENT: "%",
  MCG_PER_ML: "mcg/mL",
  MG_PER_ML: "mg/mL",
  IU_PER_ML: "IU/mL",
  MMOL_PER_ML: "mmol/mL",
  MEQ_PER_ML: "mEq/mL",
}

type CalcMethod = "NONE" | "PER_KG" | "PER_M2" | "FLAT"


function unitParts(mode: RouteMode) {
  const unit = canonicalDoseUnit(mode.unit, mode.weightBasis)
  return {
    amount: unit?.amount ?? "MG" as DoseAmountUnit,
    bodyBasis: unit?.bodyBasis ?? "NONE" as DoseBodyBasis,
    timeBasis: unit?.timeBasis ?? "NONE" as DoseTimeBasis,
  }
}

function displayUnit(
  amount: DoseAmountUnit,
  bodyBasis: DoseBodyBasis,
  timeBasis: DoseTimeBasis,
) {
  return [
    AMOUNT_DISPLAY[amount],
    bodyBasis === "NONE" ? null : bodyBasis === "BSA_M2" ? "m2" : "kg",
    timeBasis === "NONE" ? null : timeBasis === "MINUTE" ? "min" : "hr",
  ].filter(Boolean).join("/")
}

function weightBasis(bodyBasis: DoseBodyBasis): WeightBasis {
  return bodyBasis === "IBW"
    ? "IBW"
    : bodyBasis === "TBW"
      ? "TBW"
      : bodyBasis === "BSA_M2"
        ? "BSA_M2"
        : "none"
}

function listValue(value: string): string[] {
  return [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))]
}

function numberValue(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value.replace(",", "."))
  return Number.isFinite(parsed) ? parsed : undefined
}

function calcMethod(calc: DoseCalc | undefined): CalcMethod {
  if (!calc) return "NONE"
  if (calc.perKg != null) return "PER_KG"
  if (calc.perM2 != null) return "PER_M2"
  return calc.flat != null ? "FLAT" : "NONE"
}

function calcAmount(calc: DoseCalc | undefined): number | undefined {
  return calc?.perKg ?? calc?.perM2 ?? calc?.flat
}

function routeName(route: string): string {
  return ADMINISTRATION_ROUTES.find(item => item.code === route)?.labelEn ?? route
}

function NumberInput({
  label,
  value,
  onChange,
  anchorId,
}: {
  label: string
  value?: number
  onChange: (value: number | undefined) => void
  /** Lets the live preview scroll/focus straight to this control. */
  anchorId?: string
}) {
  return (
    <label id={anchorId} className={labelClass}>
      {label}
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={value ?? ""}
        onChange={event => onChange(numberValue(event.target.value))}
        className={fieldClass}
      />
    </label>
  )
}

function ListInput({
  label,
  values,
  onChange,
  anchorId,
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  /** Lets the live preview scroll/focus straight to this control. */
  anchorId?: string
}) {
  const [draft, setDraft] = useState(values.join(", "))
  return (
    <label id={anchorId} className={labelClass}>
      {label}
      <input
        value={draft}
        onChange={event => {
          setDraft(event.target.value)
          onChange(listValue(event.target.value))
        }}
        className={fieldClass}
      />
    </label>
  )
}

function fixedFluidRate(calculation?: FluidRateCalculation) {
  return {
    ...FLUID_RATE_SLIDER,
    ...(calculation ? { calculation } : {}),
  }
}

export function normalizeFluidRuntimeProfile(profile: DoseProfile): DoseProfile {
  if (profile.kind !== "fluid") return profile
  const modes: FluidEntryMode[] = profile.fluidEntryModes?.length
    ? [...profile.fluidEntryModes]
    : ["VOLUME", "RATE"]
  const hasRate = modes.includes("RATE")
  return {
    ...profile,
    fluidEntryModes: modes,
    defaultFluidEntryMode: profile.defaultFluidEntryMode && modes.includes(profile.defaultFluidEntryMode)
      ? profile.defaultFluidEntryMode
      : modes[0],
    fluidRate: hasRate
      ? fixedFluidRate(profile.fluidRate?.calculation)
      : undefined,
  }
}

function FluidEntryProfileFields({
  profile,
  onChange,
}: {
  profile: DoseProfile
  onChange: (profile: DoseProfile) => void
}) {
  const copy = useDoseProfileCopy()
  const modes = profile.fluidEntryModes?.length
    ? [...profile.fluidEntryModes]
    : [...FLUID_ENTRY_MODES]
  const defaultMode = profile.defaultFluidEntryMode && modes.includes(profile.defaultFluidEntryMode)
    ? profile.defaultFluidEntryMode
    : modes[0] ?? "VOLUME"
  const calculation = profile.fluidRate?.calculation ?? ""

  function toggleMode(mode: FluidEntryMode) {
    const included = modes.includes(mode)
    if (included && modes.length === 1) return
    const nextModes = included
      ? modes.filter(item => item !== mode)
      : [...modes, mode]
    const nextDefault = nextModes.includes(defaultMode) ? defaultMode : nextModes[0]
    const rateIncluded = nextModes.includes("RATE")
    onChange({
      ...profile,
      fluidEntryModes: nextModes,
      defaultFluidEntryMode: nextDefault,
      fluidRate: rateIncluded ? fixedFluidRate(profile.fluidRate?.calculation) : undefined,
    })
  }

  function updateCalculation(value: string) {
    const nextCalculation = value || undefined
    onChange({
      ...profile,
      fluidRate: fixedFluidRate(nextCalculation as FluidRateCalculation | undefined),
    })
  }

  return (
    <fieldset className="space-y-3 border-t border-slate-200 pt-4 dark:border-[#303030]">
      <legend className="px-1 text-xs font-bold uppercase text-slate-500">{copy.fluidEntry}</legend>
      <div className="grid gap-3 md:grid-cols-3">
        <div className={labelClass}>
          {copy.includedEntryModes}
          <div className="flex gap-2" role="group" aria-label={copy.includedFluidEntryModes}>
            {FLUID_ENTRY_MODES.map(mode => {
              const selected = modes.includes(mode)
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleMode(mode)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold ${selected ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300" : "border-slate-300 text-slate-600 dark:border-[#3a3a3a] dark:text-slate-300"}`}
                >
                  {mode === "VOLUME" ? "Bag" : "Rate"}
                </button>
              )
            })}
          </div>
        </div>
        <label className={labelClass}>
          {copy.defaultFluidEntry}
          <select
            value={defaultMode}
            onChange={event => onChange({
              ...profile,
              fluidEntryModes: modes,
              defaultFluidEntryMode: event.target.value as FluidEntryMode,
              fluidRate: modes.includes("RATE")
                ? fixedFluidRate(profile.fluidRate?.calculation)
                : undefined,
            })}
            className={fieldClass}
          >
            {modes.map(mode => <option key={mode} value={mode}>{mode === "VOLUME" ? "Bag" : "Rate"}</option>)}
          </select>
        </label>
        <label className={labelClass}>
          {copy.rateAutofill}
          <select
            value={calculation}
            disabled={!modes.includes("RATE")}
            onChange={event => updateCalculation(event.target.value)}
            className={fieldClass}
          >
            <option value="">Manual only</option>
            {FLUID_RATE_CALCULATIONS.map(item => (
              <option key={item} value={item}>Pediatric 4/2/1</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Rate slider is fixed at 1–200 mL/h in the clinical selector (step 1). Higher values remain available through manual numeric entry.
      </p>
    </fieldset>
  )
}

export function DoseProfileEditor({
  profile,
  onChange,
  previewWeightKg,
}: {
  profile: DoseProfile
  onChange: (profile: DoseProfile) => void
  /** Representative patient weight for the live preview (per pediatric band). */
  previewWeightKg?: number
}) {
  const copy = useDoseProfileCopy()
  const initialRoute = profile.defaultRoute ?? profile.routes[0] ?? "IV"
  const [activeRoute, setActiveRoute] = useState(initialRoute)
  const [previewSection, setPreviewSection] = useState<PreviewSection | null>(null)
  const [routeToAdd, setRouteToAdd] = useState<AdministrationRouteCode | "">("")
  const [copyFromRoute, setCopyFromRoute] = useState(initialRoute)
  const selectedRoute = profile.routes.includes(activeRoute)
    ? activeRoute
    : profile.defaultRoute ?? profile.routes[0] ?? "IV"
  const selectedCopyFromRoute = profile.routes.includes(copyFromRoute)
    ? copyFromRoute
    : profile.defaultRoute ?? profile.routes[0] ?? "IV"

  const routeMode = useMemo(
    () => effectiveRouteMode(profile, selectedRoute),
    [profile, selectedRoute],
  )
  const parts = useMemo(
    () => routeMode ? unitParts(routeMode) : null,
    [routeMode],
  )
  const issues = doseProfileEditorIssues(profile)
  const availableRoutes = ADMINISTRATION_ROUTES.filter(route => !profile.routes.includes(route.code))

  function updateRoute(change: Partial<RouteMode>) {
    if (!routeMode) return
    const nextMode = { ...routeMode, ...change }
    const routeModes = Object.fromEntries(
      Object.entries(profile.routeModes ?? {}).filter(([route]) => profile.routes.includes(route)),
    )
    onChange({
      ...profile,
      routeModes: { ...routeModes, [selectedRoute]: nextMode },
    })
  }

  function updateDoseCalc(change: Partial<DoseCalc> | null) {
    if (!routeMode) return
    if (change === null) {
      updateRoute({ doseCalc: undefined })
      return
    }
    updateRoute({ doseCalc: { ...(routeMode.doseCalc ?? {}), ...change } })
  }

  function changeCalcMethod(method: CalcMethod) {
    if (method === "NONE") {
      updateDoseCalc(null)
      return
    }
    const amount = calcAmount(routeMode?.doseCalc) ?? 1
    const retained = {
      roundTo: routeMode?.doseCalc?.roundTo,
      cap: routeMode?.doseCalc?.cap,
      capAtActualWeight: routeMode?.doseCalc?.capAtActualWeight,
    }
    if (method === "PER_KG") updateRoute({ doseCalc: { ...retained, perKg: amount, basis: "TBW" } })
    if (method === "PER_M2") updateRoute({ doseCalc: { ...retained, perM2: amount, basis: "BSA_M2" } })
    if (method === "FLAT") updateRoute({ doseCalc: { ...retained, flat: amount } })
  }

  function changeCalcAmount(value: number | undefined) {
    const method = calcMethod(routeMode?.doseCalc)
    if (value == null || method === "NONE") return
    if (method === "PER_KG") updateDoseCalc({ perKg: value })
    if (method === "PER_M2") updateDoseCalc({ perM2: value })
    if (method === "FLAT") updateDoseCalc({ flat: value })
  }

  function addRoute() {
    if (!routeToAdd || profile.routes.includes(routeToAdd)) return
    const source = effectiveRouteMode(profile, selectedCopyFromRoute)
    if (!source) return
    const routes = [...profile.routes, routeToAdd]
    const routeModes = Object.fromEntries(
      Object.entries(profile.routeModes ?? {}).filter(([route]) => routes.includes(route)),
    )
    onChange({
      ...profile,
      routes,
      defaultRoute: profile.defaultRoute ?? routes[0],
      routeModes: { ...routeModes, [routeToAdd]: cloneRouteMode(source) },
    })
    setActiveRoute(routeToAdd)
    setRouteToAdd("")
  }

  function removeActiveRoute() {
    if (profile.routes.length <= 1) return
    const routes = profile.routes.filter(route => route !== selectedRoute)
    const routeModes = Object.fromEntries(
      Object.entries(profile.routeModes ?? {}).filter(([route]) => routes.includes(route)),
    )
    const doseCalcByRoute = profile.doseCalcByRoute
      ? Object.fromEntries(Object.entries(profile.doseCalcByRoute).filter(([route]) => routes.includes(route)))
      : undefined
    const suggestedVolumeByRoute = profile.suggestedVolumeByRoute
      ? Object.fromEntries(Object.entries(profile.suggestedVolumeByRoute).filter(([route]) => routes.includes(route)))
      : undefined
    const defaultRoute = profile.defaultRoute === selectedRoute
      ? routes[0]
      : profile.defaultRoute ?? routes[0]
    onChange({ ...profile, routes, defaultRoute, routeModes, doseCalcByRoute, suggestedVolumeByRoute })
    setActiveRoute(defaultRoute)
  }

  if (!routeMode || !parts) {
    return (
      <p role="alert" className="text-sm font-semibold text-red-600">
        This route has no complete dose surface. Copy a complete route surface before saving.
      </p>
    )
  }

  const method = calcMethod(routeMode.doseCalc)
  const concentrationOptions = routeMode.concentrationOptions ?? []
  const formulationOptions = routeMode.formulationOptions ?? []

  function focusPreviewSection(section: PreviewSection) {
    setPreviewSection(section)
    const anchor = document.getElementById(`dose-profile-${section}`)
    anchor?.scrollIntoView({ behavior: "smooth", block: "center" })
    anchor?.querySelector<HTMLElement>("input, select")?.focus()
  }

  return (
    <div className="space-y-5 border-t border-slate-200 pt-4 dark:border-[#303030]">
      <ProfilePreview
        profile={profile}
        route={selectedRoute}
        activeSection={previewSection}
        onEdit={focusPreviewSection}
        defaultWeightKg={previewWeightKg ?? 70}
      />
      {profile.kind === "fluid" ? (
        <FluidEntryProfileFields profile={profile} onChange={onChange} />
      ) : null}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className={labelClass}>
          {copy.addIncludedRoute}
          <select value={routeToAdd} onChange={event => setRouteToAdd(event.target.value as AdministrationRouteCode | "")} className={fieldClass}>
            <option value="">{copy.selectRoute}</option>
            {availableRoutes.map(route => <option key={route.code} value={route.code}>{route.labelEn}</option>)}
          </select>
        </label>
        <label className={labelClass}>
          {copy.copySurfaceFrom}
          <select value={selectedCopyFromRoute} onChange={event => setCopyFromRoute(event.target.value)} className={fieldClass}>
            {profile.routes.map(route => <option key={route} value={route}>{routeName(route)} · {effectiveRouteMode(profile, route)?.unit ?? "?"}</option>)}
          </select>
        </label>
        <button type="button" disabled={!routeToAdd} onClick={addRoute} className="self-end rounded-md border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50 dark:text-blue-300">
          {copy.addRoute}
        </button>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Included routes</p>
        <div role="tablist" aria-label={copy.includedRoutes} className="flex gap-2 overflow-x-auto pb-1">
          {profile.routes.map(route => {
            const unit = effectiveRouteMode(profile, route)?.unit ?? "?"
            const isDefault = profile.defaultRoute === route
            return (
              <button
                key={route}
                type="button"
                role="tab"
                aria-selected={selectedRoute === route}
                onClick={() => setActiveRoute(route)}
                className={`shrink-0 rounded-md border px-3 py-2 text-xs font-semibold ${selectedRoute === route ? "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200" : "border-slate-300 text-slate-600 dark:border-[#3a3a3a] dark:text-slate-300"}`}
              >
                {route} · {unit}{isDefault ? " · default" : ""}
              </button>
            )
          })}
        </div>
      </div>

      <section role="tabpanel" aria-label={copy.doseSettings(routeName(selectedRoute))} className="space-y-4 border-l-2 border-blue-400 pl-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{routeName(selectedRoute)} ({selectedRoute})</h4>
            {!profile.routeModes?.[selectedRoute] ? <p className="text-xs text-amber-700 dark:text-amber-300">{copy.inheritedNote}</p> : null}
          </div>
          <div className="flex gap-2">
            {profile.defaultRoute !== selectedRoute ? (
              <button type="button" onClick={() => onChange({ ...profile, defaultRoute: selectedRoute })} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold">{copy.makeDefault}</button>
            ) : null}
            <button type="button" disabled={profile.routes.length <= 1} onClick={removeActiveRoute} className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-40">{copy.removeRoute}</button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>
            {copy.entryMode}
            <select value={routeMode.mode} onChange={event => updateRoute({ mode: event.target.value as RouteMode["mode"] })} className={fieldClass}>
              {DOSE_MODE.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label id="dose-profile-unit" className={labelClass}>
            {copy.amountUnit}
            <select value={parts.amount} onChange={event => updateRoute({ unit: displayUnit(event.target.value as DoseAmountUnit, parts.bodyBasis, parts.timeBasis) })} className={fieldClass}>
              {AMOUNTS.map(item => <option key={item} value={item}>{AMOUNT_DISPLAY[item]}</option>)}
            </select>
          </label>
          <label className={labelClass}>
            {copy.bodyUnit}
            <select value={parts.bodyBasis} onChange={event => {
              const basis = event.target.value as DoseBodyBasis
              updateRoute({ unit: displayUnit(parts.amount, basis, parts.timeBasis), weightBasis: weightBasis(basis) })
            }} className={fieldClass}>
              {BODY_BASES.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className={labelClass}>
            {copy.timeUnit}
            <select value={parts.timeBasis} onChange={event => updateRoute({ unit: displayUnit(parts.amount, parts.bodyBasis, event.target.value as DoseTimeBasis) })} className={fieldClass}>
              {TIME_BASES.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <NumberInput anchorId="dose-profile-slider" label={copy.sliderMin} value={routeMode.min} onChange={value => value != null && updateRoute({ min: value })} />
          <NumberInput label={copy.sliderMax} value={routeMode.max} onChange={value => value != null && updateRoute({ max: value })} />
          <NumberInput label={copy.sliderStep} value={routeMode.step} onChange={value => value != null && updateRoute({ step: value, variableStep: undefined })} />
          <label className={labelClass}>
            {copy.sliderRounding}
            <select value={profile.rounding} onChange={event => onChange({ ...profile, rounding: event.target.value as DoseProfile["rounding"] })} className={fieldClass}>
              {ROUNDING.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <ListInput
          key={`quick:${selectedRoute}`}
          anchorId="dose-profile-quick"
          label={copy.quickDosePills(routeMode.unit)}
          values={routeMode.quickValues.map(String)}
          onChange={values => updateRoute({ quickValues: values.map(Number).filter(Number.isFinite) })}
        />

        <fieldset id="dose-profile-autofill" className="space-y-3 border-t border-slate-200 pt-3 dark:border-[#303030]">
          <legend className="px-1 text-xs font-bold uppercase text-slate-500">{copy.autofillCalculation}</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={labelClass}>
              {copy.calculation}
              <select value={method} onChange={event => changeCalcMethod(event.target.value as CalcMethod)} className={fieldClass}>
                <option value="NONE">{copy.manualOnly}</option>
                <option value="PER_KG">{copy.perKg}</option>
                <option value="PER_M2">{copy.perM2}</option>
                <option value="FLAT">{copy.flatAmount}</option>
              </select>
            </label>
            {method !== "NONE" ? <NumberInput label={copy.calculationAmount} value={calcAmount(routeMode.doseCalc)} onChange={changeCalcAmount} /> : null}
            {method === "PER_KG" ? (
              <label className={labelClass}>
                {copy.weightBasis}
                <select value={routeMode.doseCalc?.basis ?? "TBW"} onChange={event => updateDoseCalc({ basis: event.target.value as Exclude<WeightBasis, "none"> })} className={fieldClass}>
                  <option value="TBW">TBW</option>
                  <option value="IBW">IBW</option>
                </select>
              </label>
            ) : null}
            {method !== "NONE" ? <NumberInput label={copy.autofillRoundTo} value={routeMode.doseCalc?.roundTo} onChange={value => updateDoseCalc({ roundTo: value })} /> : null}
            {method !== "NONE" ? <NumberInput label={copy.autofillCap} value={routeMode.doseCalc?.cap} onChange={value => updateDoseCalc({ cap: value })} /> : null}
          </div>
          {method !== "NONE" ? (
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={routeMode.doseCalc?.capAtActualWeight ?? false} onChange={event => updateDoseCalc({ capAtActualWeight: event.target.checked || undefined })} />
              {copy.capAtActualWeight}
            </label>
          ) : null}
        </fieldset>

        <fieldset id="dose-profile-concentration" className="space-y-3 border-t border-slate-200 pt-3 dark:border-[#303030]">
          <legend className="px-1 text-xs font-bold uppercase text-slate-500">{copy.concentrationSection}</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className={labelClass}>
              {copy.concentrationUnit}
              <select value={routeMode.concentrationUnit ?? ""} onChange={event => updateRoute({ concentrationUnit: event.target.value || undefined })} className={fieldClass}>
                <option value="">None</option>
                {CONCENTRATION_UNITS.map(item => <option key={item} value={item}>{CONCENTRATION_DISPLAY[item]}</option>)}
              </select>
            </label>
            <ListInput
              key={`concentrations:${selectedRoute}`}
              label={copy.concentrationPills}
              values={concentrationOptions}
              onChange={options => updateRoute({ concentrationOptions: options, defaultConcentration: options.includes(routeMode.defaultConcentration ?? "") ? routeMode.defaultConcentration : undefined })}
            />
            <label className={labelClass}>
              {copy.preselectedConcentration}
              <select value={routeMode.defaultConcentration ?? ""} disabled={!concentrationOptions.length} onChange={event => updateRoute({ defaultConcentration: event.target.value || undefined })} className={fieldClass}>
                <option value="">None</option>
                {concentrationOptions.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className={labelClass}>
              {copy.suggestedConcentration}
              <input value={routeMode.suggestedConcentration ?? ""} onChange={event => updateRoute({ suggestedConcentration: event.target.value.trim() || undefined })} className={fieldClass} />
            </label>
          </div>
          <div id="dose-profile-formulation" className="space-y-2">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{copy.formulationPills}</p>
            <div className="flex flex-wrap gap-2">
              {LOCAL_ANAESTHETIC_FORMULATIONS.map(item => {
                const selected = formulationOptions.includes(item)
                return (
                  <button key={item} type="button" aria-pressed={selected} onClick={() => {
                    const options = selected ? formulationOptions.filter(value => value !== item) : [...formulationOptions, item]
                    updateRoute({ formulationOptions: options, defaultFormulation: options.includes(routeMode.defaultFormulation as LocalAnaestheticFormulation) ? routeMode.defaultFormulation : undefined })
                  }} className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${selected ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300" : "border-slate-300 text-slate-600 dark:border-[#3a3a3a] dark:text-slate-300"}`}>
                    {item.toLowerCase()}
                  </button>
                )
              })}
            </div>
            <label className={`${labelClass} max-w-sm`}>
              {copy.preselectedFormulation}
              <select value={routeMode.defaultFormulation ?? ""} disabled={!formulationOptions.length} onChange={event => updateRoute({ defaultFormulation: (event.target.value || undefined) as LocalAnaestheticFormulation | undefined })} className={fieldClass}>
                <option value="">None</option>
                {formulationOptions.map(item => <option key={item} value={item}>{item.toLowerCase()}</option>)}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-slate-200 pt-3 dark:border-[#303030]">
          <legend className="px-1 text-xs font-bold uppercase text-slate-500">{copy.volumeSection}</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <NumberInput label={copy.suggestedVolume} value={routeMode.suggestedVolume} onChange={value => updateRoute({ suggestedVolume: value })} />
            <NumberInput label={copy.suggestedRate} value={routeMode.suggestedRate} onChange={value => updateRoute({ suggestedRate: value })} />
            <NumberInput label={copy.prepAmount} value={routeMode.prepStrength?.mg} onChange={value => updateRoute({ prepStrength: value == null && routeMode.prepStrength?.mL == null ? undefined : { mg: value ?? 0, mL: routeMode.prepStrength?.mL ?? 0 } })} />
            <NumberInput label={copy.prepVolume} value={routeMode.prepStrength?.mL} onChange={value => updateRoute({ prepStrength: value == null && routeMode.prepStrength?.mg == null ? undefined : { mg: routeMode.prepStrength?.mg ?? 0, mL: value ?? 0 } })} />
          </div>
        </fieldset>
      </section>

      {issues.length ? (
        <ul role="alert" className="list-disc space-y-1 pl-5 text-sm font-semibold text-red-600">
          {issues.map(issue => <li key={issue}>{issue}</li>)}
        </ul>
      ) : null}

      <details>
        <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">Advanced profile (read only)</summary>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-700 dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-slate-300">{JSON.stringify(profile, null, 2)}</pre>
      </details>
    </div>
  )
}
