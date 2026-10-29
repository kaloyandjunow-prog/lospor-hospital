"use client"

import type { ReactNode } from "react"

export function PillGroup({ options, value, onChange }: { options: { value: string; label: string; icon?: ReactNode }[]; value: string; onChange: (v: string) => void }) {
  return <div className="flex gap-1.5 flex-wrap">{options.map(o => <button key={o.value} type="button" onClick={() => onChange(o.value)} className={`flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg border text-xs font-semibold transition-all ${value === o.value ? "bg-slate-800 dark:bg-slate-200 border-slate-700 dark:border-slate-300 text-white dark:text-slate-900" : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-[#555]"}`}>{o.icon && <span className="shrink-0">{o.icon}</span>}{o.label}</button>)}</div>
}
