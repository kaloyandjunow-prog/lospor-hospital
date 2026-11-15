"use client"

import { useEffect, useRef, useState } from "react"
import { departmentYear, izYearChoiceOpen, izYearHint, readIzYearChoice, type IzYearChoice as Choice } from "@/lib/iz-year"

/**
 * Which year the ИЗ № belongs to, asked only in the first 60 days of a year
 * (hospital 1.9.2). Pre-set from the API's suggestion; once the clinician
 * picks, a later answer for the same number never moves it.
 */
export function IzYearChoice({
  number,
  value,
  onChange,
  locale,
  anyTime = false,
}: {
  /** A correction may name last year at any time: a January case is corrected in March. */
  anyTime?: boolean
  number: string | null | undefined
  value: number | undefined
  onChange: (year: number | undefined) => void
  locale: "bg" | "en"
}) {
  const windowOpen = izYearChoiceOpen()
  const open = windowOpen || anyTime
  const thisYear = departmentYear()
  // The answer is kept with the number it was for, so a stale one is never shown.
  const [answer, setAnswer] = useState<{ number: string; choice: Choice } | null>(null)
  const picked = useRef(false)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })
  const typed = number?.trim() ?? ""
  const choice = answer?.number === typed ? answer.choice : null

  useEffect(() => {
    picked.current = false
    if (!open || !typed) {
      onChangeRef.current(undefined)
      return
    }
    // Until the answer arrives, and if it never does (offline), this year.
    onChangeRef.current(thisYear)
    // After the 60 days there is nothing to suggest; the choice is plain.
    if (!windowOpen) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/hospital/iz-year?number=${encodeURIComponent(typed)}`, { signal: controller.signal, cache: "no-store" })
        .then(response => response.ok ? response.json() : null)
        .then(body => {
          const next = readIzYearChoice(body)
          if (!next) return
          setAnswer({ number: typed, choice: next })
          // The server keeps the calendar: a closed answer means this year, whatever this device thinks.
          if (!next.open && !anyTime) onChangeRef.current(undefined)
          else if (!picked.current) onChangeRef.current(next.suggestedYear)
        })
        .catch(() => {})
    }, 400)
    return () => { clearTimeout(timer); controller.abort() }
  }, [open, windowOpen, anyTime, typed, thisYear])

  if (!open || !typed || (!anyTime && choice?.open === false)) return null
  const years = choice?.open && choice.years.length ? choice.years : [thisYear, thisYear - 1]
  const selected = value ?? thisYear
  const label = locale === "bg" ? "Година на ИЗ №" : "Record number year"

  return (
    <div data-testid="iz-year-choice" className="space-y-1">
      <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {years.map(year => (
          <button
            key={year}
            type="button"
            role="radio"
            aria-checked={selected === year}
            data-testid={`iz-year-${year}`}
            onClick={() => { picked.current = true; onChange(year) }}
            className={`rounded-md border px-3 py-1 text-sm font-semibold ${selected === year
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 dark:border-[#333] dark:bg-[#181818] dark:text-slate-200"}`}
          >
            {year}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{izYearHint(choice, locale)}</p>
    </div>
  )
}
