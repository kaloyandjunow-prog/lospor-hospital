"use client"

import { useRef, useState, forwardRef, TextareaHTMLAttributes } from "react"
import { AlertTriangle } from "lucide-react"

const EGN_RE   = /\b\d{10}\b/
const MRN_RE   = /\b\d{5,9}\b/

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "maxLength"> {
  maxLength?: number
}

const GuardedTextarea = forwardRef<HTMLTextAreaElement, Props>(function GuardedTextarea(
  { maxLength = 500, className = "", onBlur, onChange, ...rest },
  forwardedRef,
) {
  const [value, setValue]   = useState((rest.defaultValue as string) ?? "")
  const [warn, setWarn]     = useState(false)
  const internalRef         = useRef<HTMLTextAreaElement>(null)
  const ref = (forwardedRef as React.RefObject<HTMLTextAreaElement>) ?? internalRef

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value.slice(0, maxLength)
    setValue(v)
    e.target.value = v
    onChange?.(e)
  }

  function handleBlur(e: React.FocusEvent<HTMLTextAreaElement>) {
    setWarn(EGN_RE.test(e.target.value) || MRN_RE.test(e.target.value))
    onBlur?.(e)
  }

  const len = typeof rest.value === "string" ? rest.value.length : value.length

  return (
    <div className="space-y-1">
      <textarea
        {...rest}
        ref={ref}
        maxLength={maxLength}
        onChange={handleChange}
        onBlur={handleBlur}
        className={`w-full rounded-md border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1c1c1c]
          px-3 py-2 text-sm text-slate-800 dark:text-slate-100
          placeholder:text-slate-400 dark:placeholder:text-slate-500
          focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${className}`}
      />
      <div className="flex items-center justify-between">
        {warn ? (
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            This may contain identifying information — please remove patient or colleague names and ID numbers.
          </span>
        ) : (
          <span />
        )}
        <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 ml-2">
          {len}/{maxLength}
        </span>
      </div>
    </div>
  )
})

export default GuardedTextarea
