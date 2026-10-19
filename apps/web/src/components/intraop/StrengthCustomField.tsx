"use client"

import { useEffect, useMemo, useState } from "react"
import { customStrength, customStrengthField } from "@lospor/core/strength-entry"
import { useIntraopUiCopy } from "./ui-copy"

/**
 * A strength typed with Other (2026-10-18): a local anaesthetic's or a fluid's
 * %, or a drug's mg/mL, entered like a dose -- one-tap values, the slider and
 * a typed number, prefilled -- rather than free text. While a typed number is
 * outside the drug's range it says so and is not passed on; on leaving the
 * box it is brought to the nearest limit, which is said too (as the PWA
 * keypad). Reports the number alone; empty while unusable.
 */
export function StrengthCustomField({ name, unit, options, onChange }: {
  name?: string
  unit?: string
  options: string[]
  onChange: (value: string) => void
}) {
  const copy = useIntraopUiCopy()
  const field = useMemo(() => customStrengthField({ name, unit, options }), [name, unit, options])
  const [text, setText] = useState(field ? String(field.prefill) : "")
  const [limitNotice, setLimitNotice] = useState<string | null>(null)
  const enter = (next: string) => { setText(next); setLimitNotice(null) }
  const result = field ? customStrength(field, text) : null
  const reported = result && "value" in result ? String(result.value) : ""
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reports the entry, not the callback
  useEffect(() => { onChange(reported) }, [reported])

  if (!field) return null
  const current = Number(text)
  return (
    <div data-testid="strength-custom-field" className="space-y-1.5 pt-1">
      <div className="flex flex-wrap gap-1">
        {field.quickValues.map(quick => (
          <button key={quick} type="button" aria-pressed={current === quick} onClick={() => enter(String(quick))}
            className={`min-h-7 whitespace-nowrap text-[10px] font-semibold px-2 py-1 rounded-full border transition-all ${current === quick ? "bg-sky-500 border-sky-500 text-white" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400"}`}>
            {quick}
          </button>
        ))}
      </div>
      <input type="range" min={field.min} max={field.max} step={field.step}
        value={Number.isFinite(current) ? Math.min(field.max, Math.max(field.min, current)) : field.min}
        aria-label={copy.customConcentrationAria(field.unit)}
        onChange={event => enter(event.target.value)} className="w-full h-1.5 accent-sky-500" />
      <div className="flex items-center gap-1.5">
        <input type="number" inputMode="decimal" step={field.step} value={text} aria-label={copy.customConcentrationAria(field.unit)}
          onChange={event => enter(event.target.value)}
          onBlur={() => {
            if (!(result && "error" in result && result.error === "range")) return
            const kept = current > field.max ? field.max : field.min
            setText(String(kept))
            setLimitNotice(current > field.max ? copy.loweredToMax(`${kept} ${field.unit}`) : copy.raisedToMin(`${kept} ${field.unit}`))
          }}
          className="min-w-0 flex-1 text-[10px] bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-md px-2 py-1 outline-none focus:border-sky-400 [appearance:textfield]" />
        <span className="text-[9px] text-slate-400">{field.unit}</span>
      </div>
      {limitNotice && <p role="status" className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">{limitNotice}</p>}
      {result && "error" in result && (
        <p role="alert" className="text-[10px] text-red-500 dark:text-red-400">{copy.strengthOutOfRange(field.min, field.max, field.unit)}</p>
      )}
    </div>
  )
}
