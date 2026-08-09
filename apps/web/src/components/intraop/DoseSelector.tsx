"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react"
import {
  canonicalConcentrationUnit,
  normalizeAdministrationRoute,
} from "@lospor/core/clinical-rule-vocabulary"
import {
  clampSelectorPage,
  CONCENTRATION_PILL_PAGE_SIZE,
  DOSE_PILL_PAGE_SIZE,
  selectorPage,
  selectorPageCount,
} from "@/lib/selector-pagination"
import type { LocalAnaestheticFormulation } from "@lospor/core/catalog"

// One reused dose-entry screen for drugs (bolus), infusions, fluids, and
// agents — extracted out of IntraopTimetable.tsx where each of these used
// to be its own near-duplicate block. Per-category rows are toggled by which
// optional props are passed (units/routes/concentrationOptions absent =>
// that row doesn't render), not by a `category` switch inside this file, so
// adding a fifth category later doesn't mean editing this component's logic.
//
// Canonical unit/range/route DATA is intentionally not addressed here — this
// is the generic shell; the canonical library (units, ranges, routes, quick
// values per item) is a separate, later pass. This component just renders
// whatever it's given.

// Tailwind's JIT scanner needs literal class strings, not template-literal
// interpolation — every variant used anywhere in this file must appear
// written out in full somewhere in this map.
const ACCENT: Record<string, { solid: string; ring: string; focusBorder: string; text: string; pillHover: string }> = {
  violet: { solid: "bg-violet-500 border-violet-500", ring: "accent-violet-500", focusBorder: "focus:border-violet-400", text: "text-violet-500 dark:text-violet-400", pillHover: "hover:border-violet-400 dark:hover:border-violet-600" },
  blue:   { solid: "bg-blue-500 border-blue-500",     ring: "accent-blue-500",   focusBorder: "focus:border-blue-400",   text: "text-blue-500 dark:text-blue-400",   pillHover: "hover:border-blue-400 dark:hover:border-blue-600" },
  cyan:   { solid: "bg-cyan-500 border-cyan-500",     ring: "accent-cyan-500",   focusBorder: "focus:border-cyan-400",   text: "text-cyan-500 dark:text-cyan-400",   pillHover: "hover:border-cyan-400 dark:hover:border-cyan-600" },
  purple: { solid: "bg-purple-500 border-purple-500", ring: "accent-purple-500", focusBorder: "focus:border-purple-400", text: "text-purple-500 dark:text-purple-400", pillHover: "hover:border-purple-400 dark:hover:border-purple-600" },
  sky:    { solid: "bg-sky-500 border-sky-500",       ring: "accent-sky-500",    focusBorder: "focus:border-sky-400",    text: "text-sky-500 dark:text-sky-400",    pillHover: "hover:border-sky-400 dark:hover:border-sky-600" },
}

export type DoseSelectorProps = {
  accent?: keyof typeof ACCENT
  hint?: string
  extraHint?: string

  quickValues?: number[]
  quickValue?: number

  value: string
  onValueChange: (v: string) => void
  min: number
  max: number
  step: number
  valuePlaceholder?: string
  manualEntryOnly?: boolean

  units?: string[]
  unit?: string
  onUnitChange?: (u: string) => void
  unitSuffix?: string

  routes?: string[]
  route?: string
  onRouteChange?: (r: string) => void

  concentrationOptions?: string[]
  concentration?: string
  concentrationUnit?: string
  onConcentrationChange?: (c: string | undefined) => void
  customConcentration?: string
  onCustomConcentrationChange?: (v: string) => void

  formulationOptions?: LocalAnaestheticFormulation[]
  formulation?: LocalAnaestheticFormulation
  onFormulationChange?: (formulation: LocalAnaestheticFormulation) => void

  // Omit both when the caller needs to combine this picker's value with
  // something else (e.g. agents also pick N2O%) behind one outer button.
  confirmLabel?: string
  onConfirm?: () => void
  confirmDisabled?: boolean
  stickyConfirm?: boolean
}

export function DoseSelector({
  accent = "violet", hint, extraHint,
  quickValues, quickValue,
  value, onValueChange, min, max, step, valuePlaceholder = "Value", manualEntryOnly = false,
  units, unit, onUnitChange, unitSuffix,
  routes, route, onRouteChange,
  concentrationOptions, concentration, concentrationUnit, onConcentrationChange, customConcentration, onCustomConcentrationChange,
  formulationOptions, formulation, onFormulationChange,
  confirmLabel, onConfirm, confirmDisabled, stickyConfirm = false,
}: DoseSelectorProps) {
  const customConcentrationRef = useRef<HTMLInputElement>(null)
  const [dosePage, setDosePage] = useState(0)
  const [concentrationPage, setConcentrationPage] = useState(0)
  const [customConcentrationOpen, setCustomConcentrationOpen] = useState(
    () => !!customConcentration || (!!concentration && !(concentrationOptions ?? []).includes(concentration)),
  )
  const a = ACCENT[accent] ?? ACCENT.violet
  const num = parseFloat(value) || 0
  const pillBase = "min-h-7 text-[10px] font-semibold px-2 py-1 rounded-full border transition-all"
  const pillOff  = "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400"
  const doseValues = useMemo(() => quickValues ?? [], [quickValues])
  const safeDosePage = clampSelectorPage(doseValues.length, DOSE_PILL_PAGE_SIZE, dosePage)
  const dosePageCount = selectorPageCount(doseValues.length, DOSE_PILL_PAGE_SIZE)
  const visibleDoseValues = selectorPage(doseValues, DOSE_PILL_PAGE_SIZE, safeDosePage)
  const presetConcentrations = useMemo(
    () => (concentrationOptions ?? []).filter(
      option => option.trim().toLocaleLowerCase() !== "other",
    ),
    [concentrationOptions],
  )
  const safeConcentrationPage = clampSelectorPage(
    presetConcentrations.length,
    CONCENTRATION_PILL_PAGE_SIZE,
    concentrationPage,
  )
  const concentrationPageCount = selectorPageCount(
    presetConcentrations.length,
    CONCENTRATION_PILL_PAGE_SIZE,
  )
  const visibleConcentrations = selectorPage(
    presetConcentrations,
    CONCENTRATION_PILL_PAGE_SIZE,
    safeConcentrationPage,
  )
  const customConcentrationUnit = canonicalConcentrationUnit(concentrationUnit ?? "%")?.display ?? "%"
  const showConcentration = !!concentrationUnit || presetConcentrations.length > 0
  const selectorIdentity = `${route ?? ""}::${doseValues.join("|")}::${presetConcentrations.join("|")}`
  const previousSelectorIdentity = useRef(selectorIdentity)

  useEffect(() => {
    if (previousSelectorIdentity.current === selectorIdentity) return
    previousSelectorIdentity.current = selectorIdentity
    const selectedDoseIndex = doseValues.findIndex(option => option === num)
    const selectedConcentrationIndex = concentration
      ? presetConcentrations.indexOf(concentration)
      : -1
    setDosePage(selectedDoseIndex >= 0
      ? Math.floor(selectedDoseIndex / DOSE_PILL_PAGE_SIZE)
      : 0)
    setConcentrationPage(selectedConcentrationIndex >= 0
      ? Math.floor(selectedConcentrationIndex / CONCENTRATION_PILL_PAGE_SIZE)
      : 0)
    setCustomConcentrationOpen(
      !!customConcentration || (!!concentration && selectedConcentrationIndex < 0),
    )
  }, [concentration, customConcentration, doseValues, num, presetConcentrations, selectorIdentity])

  function openCustomConcentration() {
    setCustomConcentrationOpen(true)
    onConcentrationChange?.(undefined)
    onCustomConcentrationChange?.("")
    requestAnimationFrame(() => customConcentrationRef.current?.focus())
  }

  return (
    <div className="space-y-2">
      {hint && <p className={`text-[9px] font-medium ${a.text}`}>{hint}</p>}

      {routes && routes.length > 1 && (
        <div className="flex flex-wrap gap-1" aria-label="Route">
          {routes.map(r => {
            const canonical = normalizeAdministrationRoute(r)
            const routeValue = canonical ?? r
            const selectedRoute = route ? normalizeAdministrationRoute(route) ?? route : route
            return (
              <button key={r} type="button"
                onClick={() => onRouteChange?.(routeValue)}
                aria-pressed={selectedRoute === routeValue}
                className={`${pillBase} ${selectedRoute === routeValue ? "bg-slate-700 border-slate-700 text-white dark:bg-slate-200 dark:border-slate-200 dark:text-slate-900" : pillOff}`}>
                {canonical ?? r}
              </button>
            )
          })}
        </div>
      )}

      {formulationOptions && formulationOptions.length > 0 && (
        <div className="space-y-1.5 pb-1 border-b border-slate-100 dark:border-[#2a2a2a]">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Formulation</p>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${formulationOptions.length}, minmax(0, 1fr))` }}
          >
            {formulationOptions.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => onFormulationChange?.(option)}
                aria-pressed={formulation === option}
                className={`${pillBase} truncate ${formulation === option ? "bg-sky-500 border-sky-500 text-white" : pillOff + " hover:border-sky-400 dark:hover:border-sky-600"}`}
              >
                {option.charAt(0) + option.slice(1).toLocaleLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {showConcentration && (
        <div className="space-y-1.5 pb-1 border-b border-slate-100 dark:border-[#2a2a2a]">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Concentration</p>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${Math.max(visibleConcentrations.length, 1)}, minmax(0, 1fr))` }}
            >
              {visibleConcentrations.map(c => (
                <button key={c} type="button"
                  onClick={() => {
                    setCustomConcentrationOpen(false)
                    onCustomConcentrationChange?.("")
                    onConcentrationChange?.(c)
                  }}
                  aria-pressed={!customConcentrationOpen && concentration === c}
                  className={`${pillBase} ${!customConcentrationOpen && concentration === c ? "bg-sky-500 border-sky-500 text-white" : pillOff + " hover:border-sky-400 dark:hover:border-sky-600"}`}>
                  {c}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={openCustomConcentration}
              aria-pressed={customConcentrationOpen}
              className={`${pillBase} ${customConcentrationOpen ? "bg-sky-500 border-sky-500 text-white" : pillOff + " hover:border-sky-400 dark:hover:border-sky-600"}`}
            >
              Other
            </button>
          </div>
          {concentrationPageCount > 1 && (
            <PillPager
              label="Concentration presets"
              page={safeConcentrationPage}
              pageCount={concentrationPageCount}
              onPageChange={setConcentrationPage}
            />
          )}
          {customConcentrationOpen && (
            <div className="flex items-center gap-1.5">
              <input ref={customConcentrationRef} type="number" min="0.01" max={customConcentrationUnit === "%" ? 20 : undefined} step="0.001" placeholder="e.g. 0.75"
                value={customConcentration ?? ""}
                aria-label={`Custom concentration ${customConcentrationUnit}`}
                onChange={e => {
                  const v = e.target.value
                  onConcentrationChange?.(v ? `${v}${customConcentrationUnit}` : undefined)
                  onCustomConcentrationChange?.(v)
                }}
                className="min-w-0 flex-1 text-[10px] bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-md px-2 py-1 outline-none focus:border-sky-400 [appearance:textfield]" />
              <span className="text-[9px] text-slate-400">{customConcentrationUnit}</span>
            </div>
          )}
        </div>
      )}

      {quickValues && quickValues.length > 0 && (
        <div className="space-y-1">
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${visibleDoseValues.length}, minmax(0, 1fr))` }}
          >
            {visibleDoseValues.map(qv => (
              <button key={qv} type="button"
                onClick={() => onValueChange(String(qv))}
                aria-pressed={(quickValue ?? num) === qv}
                className={`${pillBase} ${(quickValue ?? num) === qv ? a.solid + " text-white" : pillOff + " " + a.pillHover}`}>
                {qv}
              </button>
            ))}
          </div>
          {dosePageCount > 1 && (
            <PillPager
              label="Quick doses"
              page={safeDosePage}
              pageCount={dosePageCount}
              onPageChange={setDosePage}
            />
          )}
        </div>
      )}

      {!manualEntryOnly && (
        <input type="range" min={min} max={max} step={step}
          value={num}
          onChange={e => onValueChange(e.target.value)}
          className={`w-full h-1.5 ${a.ring}`} />
      )}

      <div className="flex items-center gap-1.5">
        {!manualEntryOnly && (
          <button type="button"
            onClick={() => onValueChange(String(Math.max(min, (parseFloat(value) || 0) - step)))}
            className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-600 dark:text-[#c0c0c0] hover:bg-slate-50 dark:hover:bg-[#333] transition-colors select-none">
            <Minus className="h-3 w-3" />
          </button>
        )}
        <input autoFocus type="number" placeholder={valuePlaceholder} value={value}
          onChange={e => onValueChange(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !confirmDisabled && onConfirm?.()}
          className={`flex-1 text-xs text-center bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1 outline-none ${a.focusBorder} [appearance:textfield]`} />
        {!manualEntryOnly && (
          <button type="button"
            onClick={() => onValueChange(String(Math.min(max, (parseFloat(value) || 0) + step)))}
            className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-600 dark:text-[#c0c0c0] hover:bg-slate-50 dark:hover:bg-[#333] transition-colors select-none">
            <Plus className="h-3 w-3" />
          </button>
        )}
        {units && units.length > 0 && !unitSuffix && (
          units.length === 1
            ? <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">{units[0]}</span>
            : null
        )}
        {unitSuffix && <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">{unitSuffix}</span>}
      </div>

      {units && units.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {units.map(u => (
            <button key={u} type="button" onClick={() => onUnitChange?.(u)}
              className={`text-[9px] px-1.5 py-0.5 rounded-md border transition-colors ${unit === u ? a.solid + " text-white" : pillOff}`}>
              {u}
            </button>
          ))}
        </div>
      )}

      {extraHint && <p className="text-[9px] text-amber-500 dark:text-amber-400">{extraHint}</p>}

      {confirmLabel && onConfirm && (
        <div className={stickyConfirm ? "sticky -bottom-3 -mx-3 bg-white px-3 pb-3 pt-1 dark:bg-[#1e1e1e]" : undefined}>
          <button type="button" onClick={onConfirm} disabled={confirmDisabled}
            className="w-full text-xs font-semibold bg-slate-700 hover:bg-slate-600 dark:bg-[#2a2a2a] dark:hover:bg-[#383838] dark:border dark:border-[#4a4a4a] disabled:opacity-40 text-white rounded-lg py-1.5">
            {confirmLabel}
          </button>
        </div>
      )}
    </div>
  )
}

type PillPagerProps = {
  label: string
  page: number
  pageCount: number
  onPageChange: (page: number) => void
}

function PillPager({ label, page, pageCount, onPageChange }: PillPagerProps) {
  return (
    <div className="flex items-center justify-center gap-1" aria-label={`${label} page ${page + 1} of ${pageCount}`}>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
        aria-label={`Previous ${label.toLocaleLowerCase()} page`}
        className="rounded p-0.5 text-slate-400 transition-colors hover:text-slate-700 disabled:opacity-25 dark:hover:text-slate-200"
      >
        <ChevronLeft className="h-3 w-3" />
      </button>
      {Array.from({ length: pageCount }, (_, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onPageChange(index)}
          aria-label={`${label} page ${index + 1}`}
          aria-current={index === page ? "page" : undefined}
          className={`h-1.5 rounded-full transition-all ${index === page ? "w-3 bg-slate-500 dark:bg-slate-300" : "w-1.5 bg-slate-200 dark:bg-slate-600"}`}
        />
      ))}
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount - 1}
        aria-label={`Next ${label.toLocaleLowerCase()} page`}
        className="rounded p-0.5 text-slate-400 transition-colors hover:text-slate-700 disabled:opacity-25 dark:hover:text-slate-200"
      >
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  )
}
