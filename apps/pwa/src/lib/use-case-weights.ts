import { useMemo } from "react"
import { calcCaseIBW } from "@/lib/case-detail-summary"

/**
 * The two weights a per-kg infusion total can be expressed against.
 *
 * Derived here rather than in the intraop screen so the timetable and the case
 * summary cannot report different totals for one case — they now read the same
 * ideal body weight from the same place, which is the whole reason
 * `calcCaseIBW` exists.
 */
export function useCaseWeights(input: {
  clinicalMode: string | null | undefined
  sex: string | null | undefined
  heightCm: number | null | undefined
  weightKg: number | null | undefined
  ageValue: number | null | undefined
  ageUnit: string | null | undefined
}): { caseIbw: number | null; caseTbw: number | null } {
  const { clinicalMode, sex, heightCm, weightKg, ageValue, ageUnit } = input
  const caseIbw = useMemo(
    () => calcCaseIBW({
      clinicalMode,
      sex: sex ?? null,
      heightCm: heightCm ?? null,
      ageValue: ageValue ?? null,
      ageUnit: ageUnit ?? null,
    } as Parameters<typeof calcCaseIBW>[0]),
    [clinicalMode, sex, heightCm, ageValue, ageUnit],
  )
  return { caseIbw, caseTbw: weightKg ?? null }
}
