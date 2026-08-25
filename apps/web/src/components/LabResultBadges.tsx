import { formatLabReferenceRange, type LabTest } from "@/lib/labs"

export function RefBadge({ test, flag }: { test: LabTest; flag: "low" | "high" | "normal" }) {
  const rangeStr = formatLabReferenceRange(test)
  if (!rangeStr) return null
  if (flag === "normal") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 whitespace-nowrap">
        {rangeStr}
      </span>
    )
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-semibold whitespace-nowrap">
      {flag === "low" ? "▼" : "▲"} {rangeStr}
    </span>
  )
}

export function CanonicalUnit({ unit, unitless }: { unit: string; unitless: string }) {
  return (
    <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#1a1a1a]">
      {unit || unitless}
    </span>
  )
}
