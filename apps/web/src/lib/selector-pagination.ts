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
  return Math.min(Math.max(Math.trunc(page), 0), pageCount - 1)
}

export function selectorPage<T>(items: readonly T[], pageSize: number, page: number): T[] {
  const safePage = clampSelectorPage(items.length, pageSize, page)
  const start = safePage * pageSize
  return items.slice(start, start + pageSize)
}
