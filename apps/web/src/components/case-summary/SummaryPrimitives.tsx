"use client"

import type { CaseDetailIntraop } from "@/types/case-detail"

export const MON: { f: keyof CaseDetailIntraop; l: string }[] = [
  { f: "ecg", l: "ECG" }, { f: "spO2Monitor", l: "SpO₂" }, { f: "nbpMonitor", l: "NBP" },
  { f: "etco2Monitor", l: "EtCO₂" }, { f: "tempMonitor", l: "Temp" }, { f: "invasiveBP", l: "IBP" },
  { f: "cvpMonitor", l: "CVP" }, { f: "paCatheter", l: "PA cath" }, { f: "tee", l: "TEE" },
  { f: "bis", l: "BIS" }, { f: "entropyMonitor", l: "Entropy" }, { f: "nirsMonitor", l: "NIRS" },
  { f: "evokedPotentials", l: "SSEP/MEP" }, { f: "tofMonitor", l: "TOF/NMT" },
  { f: "urinaryCatheter", l: "Urine" }, { f: "stomachTube", l: "NGT" },
]

export function SummaryField({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null
  return <div className="flex justify-between gap-2 py-[2px] border-b border-slate-100 dark:border-[#252525] last:border-0 text-[10.5px]"><span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span><span className="font-semibold text-slate-800 dark:text-slate-100 text-right min-w-0 break-words">{String(value)}</span></div>
}

export function SummaryChip({ children, color = "slate" }: { children: string; color?: string }) {
  const colors: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  }
  return <span className={`inline-block text-[8.5px] px-1.5 py-0.5 rounded font-medium mr-1 mb-1 ${colors[color] ?? colors.slate}`}>{children}</span>
}
