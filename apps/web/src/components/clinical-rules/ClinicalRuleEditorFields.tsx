export const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-500 dark:border-[#3a3a3a] dark:bg-[#202020] dark:text-slate-100 dark:disabled:bg-[#161616]"
export const labelClass = "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"

type EditorFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function TextField({
  label,
  value,
  onChange,
  disabled,
  multiline,
}: EditorFieldProps & { multiline?: boolean }) {
  return (
    <label className={labelClass}>
      {label}
      {multiline ? (
        <textarea value={value} disabled={disabled} rows={2} onChange={event => onChange(event.target.value)} className={inputClass} />
      ) : (
        <input value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className={inputClass} />
      )}
    </label>
  )
}

export function NumberField({ label, value, onChange, disabled }: EditorFieldProps) {
  return (
    <label className={labelClass}>
      {label}
      <input type="number" inputMode="decimal" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className={inputClass} />
    </label>
  )
}
