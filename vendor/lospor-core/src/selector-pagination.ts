/**
 * Paging for the dose and concentration pill rows in the drug/fluid/infusion
 * entry surfaces.
 *
 * Both clients show the same pills over the same option lists, but only web
 * had this as a named module: mobile re-derived it inline with the page sizes
 * written as bare 5s and 4s in eight places, no clamp, and its own answer for
 * how many pages an empty list has. Two screens paging the same clinical
 * options must not be able to disagree about which values are on screen.
 */

export const DOSE_PILL_PAGE_SIZE = 5
export const CONCENTRATION_PILL_PAGE_SIZE = 4

export function selectorPageCount(itemCount: number, pageSize: number): number {
  if (!Number.isFinite(itemCount) || !Number.isFinite(pageSize) || itemCount <= 0 || pageSize <= 0) {
    return 0
  }
  return Math.ceil(itemCount / pageSize)
}

export function clampSelectorPage(itemCount: number, pageSize: number, page: number): number {
  const pageCount = selectorPageCount(itemCount, pageSize)
  if (pageCount === 0) return 0
  // NaN must not propagate: Math.max/Math.min return NaN the moment either
  // operand is NaN, which would otherwise hand the caller NaN back as "the
  // current page". Infinity needs no special case -- Math.min already clamps
  // it to the last page correctly.
  const safePage = Number.isNaN(page) ? 0 : Math.trunc(page)
  return Math.min(Math.max(safePage, 0), pageCount - 1)
}

export function selectorPage<T>(items: readonly T[], pageSize: number, page: number): T[] {
  const safePage = clampSelectorPage(items.length, pageSize, page)
  const start = safePage * pageSize
  return items.slice(start, start + pageSize)
}

/**
 * The concentrations offered as pills, with any literal "other" dropped.
 *
 * Both surfaces render their own "Other" control for a custom value, so an
 * option list that also carries one would show it twice -- once as a preset
 * that selects the string "other", once as the real custom-entry button.
 * Web filtered this and mobile did not; nothing seeds such an option today,
 * which is exactly why the two were free to drift.
 */
export function presetConcentrations(options: readonly string[] | null | undefined): string[] {
  return (options ?? []).filter(option => option.trim().toLocaleLowerCase("en") !== "other")
}

/** Which page a selected value sits on, or 0 when it is not in the list. */
export function pageOfSelection<T>(
  items: readonly T[],
  pageSize: number,
  selected: T | null | undefined,
): number {
  if (selected == null) return 0
  const index = items.indexOf(selected)
  return index >= 0 ? Math.floor(index / pageSize) : 0
}
