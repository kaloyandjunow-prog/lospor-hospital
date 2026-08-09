import { describe, expect, it } from "vitest"
import {
  clampSelectorPage,
  CONCENTRATION_PILL_PAGE_SIZE,
  DOSE_PILL_PAGE_SIZE,
  selectorPage,
  selectorPageCount,
} from "./selector-pagination"

describe("selector pagination", () => {
  it("keeps up to five dose pills on one page", () => {
    expect(selectorPageCount(5, DOSE_PILL_PAGE_SIZE)).toBe(1)
    expect(selectorPage([1, 2, 3, 4, 5], DOSE_PILL_PAGE_SIZE, 0)).toEqual([1, 2, 3, 4, 5])
  })

  it("paginates dose pills in groups of five", () => {
    const values = [1, 2, 3, 4, 5, 6, 7]
    expect(selectorPageCount(values.length, DOSE_PILL_PAGE_SIZE)).toBe(2)
    expect(selectorPage(values, DOSE_PILL_PAGE_SIZE, 1)).toEqual([6, 7])
  })

  it("paginates concentration presets in groups of four", () => {
    const values = ["0.1%", "0.2%", "0.25%", "0.5%", "1%"]
    expect(selectorPageCount(values.length, CONCENTRATION_PILL_PAGE_SIZE)).toBe(2)
    expect(selectorPage(values, CONCENTRATION_PILL_PAGE_SIZE, 1)).toEqual(["1%"])
  })

  it("clamps a stale page after a route changes its available values", () => {
    expect(clampSelectorPage(2, DOSE_PILL_PAGE_SIZE, 3)).toBe(0)
    expect(selectorPage([], DOSE_PILL_PAGE_SIZE, 3)).toEqual([])
  })
})
