"use client"

import { useTranslations } from "next-intl"

export type ScreenSettingChoiceOption = { value: string; label: string }

/** A compact, explicit view selector; the surrounding setting stays a section, not a button. */
export function ScreenSettingChoice({
  title, value, options, onChange, testPrefix,
}: {
  title: string
  value: string
  options: readonly ScreenSettingChoiceOption[]
  onChange: (value: string) => void
  testPrefix: string
}) {
  const t = useTranslations("settings")
  return (
    <div className="border-b border-slate-100 py-4 last:border-b-0 dark:border-[#2a2a2a]" data-testid={`${testPrefix}-setting`}>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <p className="mb-2 mt-1 text-[11px] text-slate-400 dark:text-slate-500">{t("accountWideInterface")}</p>
      <div role="radiogroup" aria-label={title} className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-[#333] dark:bg-[#161616]">
        {options.map(option => {
          const picked = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={picked}
              data-testid={`${testPrefix}-${option.value}`}
              onClick={() => onChange(option.value)}
              className={`min-h-10 flex-1 rounded-lg px-2 text-sm font-semibold transition-colors ${picked
                ? "bg-white text-violet-700 shadow-sm ring-1 ring-violet-200 dark:bg-[#2a2540] dark:text-violet-200 dark:ring-violet-800"
                : "text-slate-500 hover:bg-white/70 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-[#222] dark:hover:text-slate-200"}`}
            >
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className={`grid h-4 w-4 place-items-center rounded-full border-2 text-[9px] ${picked ? "border-violet-500 bg-violet-500 text-white" : "border-slate-300 dark:border-[#555]"}`}>
                  {picked ? "✓" : ""}
                </span>
                {option.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
