"use client"
import { Minus, Plus } from "lucide-react"

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

  units?: string[]
  unit?: string
  onUnitChange?: (u: string) => void
  unitSuffix?: string

  routes?: string[]
  route?: string
  onRouteChange?: (r: string) => void

  concentrationOptions?: string[]
  concentration?: string
  onConcentrationChange?: (c: string | undefined) => void
  customConcentration?: string
  onCustomConcentrationChange?: (v: string) => void

  // Omit both when the caller needs to combine this picker's value with
  // something else (e.g. agents also pick N2O%) behind one outer button.
  confirmLabel?: string
  onConfirm?: () => void
  confirmDisabled?: boolean
}

export function DoseSelector({
  accent = "violet", hint, extraHint,
  quickValues, quickValue,
  value, onValueChange, min, max, step, valuePlaceholder = "Value",
  units, unit, onUnitChange, unitSuffix,
  routes, route, onRouteChange,
  concentrationOptions, concentration, onConcentrationChange, customConcentration, onCustomConcentrationChange,
  confirmLabel, onConfirm, confirmDisabled,
}: DoseSelectorProps) {
  const a = ACCENT[accent] ?? ACCENT.violet
  const num = parseFloat(value) || 0
  const pillBase = "text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all"
  const pillOff  = "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400"

  return (
    <div className="space-y-2">
      {hint && <p className={`text-[9px] font-medium ${a.text}`}>{hint}</p>}

      {concentrationOptions && concentrationOptions.length > 0 && (
        <div className="space-y-1.5 pb-1 border-b border-slate-100 dark:border-[#2a2a2a]">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Concentration</p>
          <div className="flex flex-wrap gap-1">
            {concentrationOptions.map(c => (
              <button key={c} type="button"
                onClick={() => onConcentrationChange?.(concentration === c ? undefined : c)}
                className={`${pillBase} ${concentration === c ? "bg-sky-500 border-sky-500 text-white" : pillOff + " hover:border-sky-400 dark:hover:border-sky-600"}`}>
                {c}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-slate-400 shrink-0">Custom:</span>
            <input type="number" min="0.01" max="20" step="0.001" placeholder="e.g. 0.75"
              value={customConcentration ?? ""}
              onChange={e => {
                const v = e.target.value
                onCustomConcentrationChange?.(v)
                onConcentrationChange?.(v ? v + "%" : undefined)
              }}
              className="w-14 text-[10px] bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-md px-1.5 py-0.5 outline-none focus:border-sky-400 [appearance:textfield]" />
            <span className="text-[9px] text-slate-400">%</span>
          </div>
        </div>
      )}

      {quickValues && quickValues.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {quickValues.map(qv => (
            <button key={qv} type="button"
              onClick={() => onValueChange(String(qv))}
              className={`${pillBase} ${(quickValue ?? num) === qv ? a.solid + " text-white" : pillOff + " " + a.pillHover}`}>
              {qv}
            </button>
          ))}
        </div>
      )}

      <input type="range" min={min} max={max} step={step}
        value={num}
        onChange={e => onValueChange(e.target.value)}
        className={`w-full h-1.5 ${a.ring}`} />

      <div className="flex items-center gap-1.5">
        <button type="button"
          onClick={() => onValueChange(String(Math.max(min, (parseFloat(value) || 0) - step)))}
          className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-600 dark:text-[#c0c0c0] hover:bg-slate-50 dark:hover:bg-[#333] transition-colors select-none">
          <Minus className="h-3 w-3" />
        </button>
        <input autoFocus type="number" placeholder={valuePlaceholder} value={value}
          onChange={e => onValueChange(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !confirmDisabled && onConfirm?.()}
          className={`flex-1 text-xs text-center bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1 outline-none ${a.focusBorder} [appearance:textfield]`} />
        <button type="button"
          onClick={() => onValueChange(String(Math.min(max, (parseFloat(value) || 0) + step)))}
          className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-600 dark:text-[#c0c0c0] hover:bg-slate-50 dark:hover:bg-[#333] transition-colors select-none">
          <Plus className="h-3 w-3" />
        </button>
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

      {routes && routes.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {routes.map(r => (
            <button key={r} type="button"
              onClick={() => onRouteChange?.(r)}
              className={`${pillBase} ${route === r ? "bg-slate-700 border-slate-700 text-white dark:bg-slate-200 dark:border-slate-200 dark:text-slate-900" : pillOff}`}>
              {r}
            </button>
          ))}
        </div>
      )}

      {confirmLabel && onConfirm && (
        <button type="button" onClick={onConfirm} disabled={confirmDisabled}
          className="w-full text-xs font-semibold bg-slate-700 hover:bg-slate-600 dark:bg-[#2a2a2a] dark:hover:bg-[#383838] dark:border dark:border-[#4a4a4a] disabled:opacity-40 text-white rounded-lg py-1.5">
          {confirmLabel}
        </button>
      )}
    </div>
  )
}
