"use client"

import { useState } from "react"

export const fieldClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500 dark:border-[#3a3a3a] dark:bg-[#202020] dark:text-slate-100 dark:disabled:bg-[#161616]"
export const labelClass = "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"

export function listValue(value: string): string[] {
  return [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))]
}

export function numberValue(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value.replace(",", "."))
  return Number.isFinite(parsed) ? parsed : undefined
}

export function NumberInput({
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

export function ListInput({
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

