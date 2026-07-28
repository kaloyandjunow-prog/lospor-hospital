"use client"
import React from "react"
import { Controller, type Control, type FieldValues, type FieldPath } from "react-hook-form"

// Numeric range select — used for bounded numeric fields (tube size, PEEP, etc.)
// Pass `values` for a non-uniform set (e.g. real-world LMA sizes 1,1.5,2,2.5,3,4,5,
// which skip 3.5/4.5) instead of min/max/step.
export function RangeSelect<T extends FieldValues>({ name, control, min, max, step = 1, values, placeholder = "—" }: {
  name: FieldPath<T>; control: Control<T>; min?: number; max?: number; step?: number; values?: number[]; placeholder?: string
}) {
  const options: React.ReactNode[] = []
  if (values) {
    for (const v of values) options.push(<option key={v} value={v}>{v}</option>)
  } else {
    for (let v = min!; v <= max!; v = Math.round((v + step) * 1000) / 1000) {
      options.push(<option key={v} value={v}>{v}</option>)
    }
  }
  return (
    <Controller name={name} control={control} render={({ field }) => (
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={field.value ?? ""}
        onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      >
        <option value="">{placeholder}</option>
        {options}
      </select>
    )} />
  )
}
