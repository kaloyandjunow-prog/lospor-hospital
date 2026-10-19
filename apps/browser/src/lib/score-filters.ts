import type { ResearchCohortDefinition, ResearchNumberRange } from "@lospor/core/research"
import { RESEARCH_SCORE_SCALES } from "@lospor/core/research-scores"

/**
 * The risk scores a cohort can be filtered on, by raw count -- the value the
 * record stores. "Apfel 3 to 4", not a band: bands follow the guideline of the
 * day, counts do not.
 */
export const SCORE_FILTER_FIELDS = ["rcri", "apfel", "stopBang", "povoc", "colds", "paedScore"] as const
export type ScoreFilterField = typeof SCORE_FILTER_FIELDS[number]
export type ScoreFilterForm = Record<`${ScoreFilterField}Min` | `${ScoreFilterField}Max`, string>

export const EMPTY_SCORE_FILTERS = Object.fromEntries(
  SCORE_FILTER_FIELDS.flatMap(field => [[`${field}Min`, ""], [`${field}Max`, ""]]),
) as ScoreFilterForm

/** The scale shown next to each filter: "0–4", "5–25". */
export function scoreFilterScale(field: ScoreFilterField): string {
  const scale = RESEARCH_SCORE_SCALES[field]
  return `${scale.min}–${scale.max}`
}

export function scoreFiltersToForm(filters: ResearchCohortDefinition["filters"]): ScoreFilterForm {
  const text = (value: number | undefined) => value === undefined ? "" : String(value)
  return Object.fromEntries(SCORE_FILTER_FIELDS.flatMap(field => [
    [`${field}Min`, text(filters[field]?.min)],
    [`${field}Max`, text(filters[field]?.max)],
  ])) as ScoreFilterForm
}

export function scoreFiltersFromForm(
  form: ScoreFilterForm,
  toNumber: (value: string) => number | undefined,
): Partial<Record<ScoreFilterField, ResearchNumberRange>> {
  const filters: Partial<Record<ScoreFilterField, ResearchNumberRange>> = {}
  for (const field of SCORE_FILTER_FIELDS) {
    const min = toNumber(form[`${field}Min`])
    const max = toNumber(form[`${field}Max`])
    if (min !== undefined || max !== undefined) {
      filters[field] = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) }
    }
  }
  return filters
}
