import {
  formatLabReferenceRange,
  rangeFor,
  type LabReferenceRange,
  type LabTest,
} from "@/lib/labs"

/**
 * The reference range, and whether the value sat inside it.
 *
 * `supplied` is the laboratory's own range for this result, where it sent
 * one. It wins over the bundled catalogue, which is a general adult
 * reference: a paediatric haemoglobin read against an adult range is the
 * ordinary case, not an exotic one, and showing the catalogue's numbers
 * beside a flag computed from the laboratory's would be worse than either
 * alone.
 */
export function RefBadge({ test, flag, supplied }: {
  test: LabTest
  flag: "low" | "high" | "normal" | "critical"
  supplied?: LabReferenceRange
}) {
  const range = rangeFor(test, supplied)
  const rangeStr = formatLabReferenceRange({ ...test, ...range })
  if (!rangeStr) return null
  if (flag === "critical") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/25 text-red-700 dark:text-red-300 font-bold whitespace-nowrap">
        {rangeStr}
      </span>
    )
  }
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
