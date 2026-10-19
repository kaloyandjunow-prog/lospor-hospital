"use client"

import { useTranslations } from "next-intl"

const CLASSES = [
  { v: "I",   color: "bg-green-500  border-green-500  text-white dark:bg-green-700  dark:border-green-500" },
  { v: "II",  color: "bg-lime-500   border-lime-500   text-white dark:bg-lime-700   dark:border-lime-500"   },
  { v: "III", color: "bg-yellow-500 border-yellow-500 text-white dark:bg-yellow-700 dark:border-yellow-500" },
  { v: "IV",  color: "bg-orange-500 border-orange-500 text-white dark:bg-orange-700 dark:border-orange-500" },
  { v: "V",   color: "bg-red-500    border-red-500    text-white dark:bg-red-700    dark:border-red-500"    },
  { v: "VI",  color: "bg-slate-500  border-slate-500  text-white dark:bg-slate-600  dark:border-slate-400"  },
] as const

/** The six ASA classes as buttons, "E" added for emergency surgery (not to VI). Tapping the chosen one clears it. */
export function AsaClassButtons({ value, onChange, emergencySurgery, className = "" }: {
  value: string | null | undefined
  onChange: (next: string | undefined) => void
  emergencySurgery: boolean
  className?: string
}) {
  const t = useTranslations()
  return (
    <div className={`grid grid-cols-3 sm:grid-cols-6 gap-2 ${className}`}>
      {CLASSES.map(opt => {
        const label = emergencySurgery && opt.v !== "VI" ? `${opt.v}E` : opt.v
        // The message reads "II — Mild systemic disease"; the button shows the class large and the words small.
        const description = t(`preop.asa${opt.v}`).replace(/^[IV]+\s*[—-]\s*/, "")
        return (
          <button key={opt.v} type="button"
            onClick={() => onChange(value === opt.v ? undefined : opt.v)}
            className={`rounded-xl border-2 p-3 text-center transition-all ${value === opt.v ? opt.color + " scale-105 shadow-sm" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"}`}>
            <div className="text-xl font-bold">{label}</div>
            <div className="text-[9px] mt-1 leading-tight">{description}</div>
          </button>
        )
      })}
    </div>
  )
}
