import { describe, expect, it } from "vitest"
import {
  clampSelectorPage,
  CONCENTRATION_PILL_PAGE_SIZE,
  DOSE_PILL_PAGE_SIZE,
  pageOfSelection,
  presetConcentrations,
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

  // An empty list has no pages, not one empty page. Mobile's inline version
  // answered 1 here, which is the disagreement this module exists to end.
  it("reports no pages for an empty list", () => {
    expect(selectorPageCount(0, DOSE_PILL_PAGE_SIZE)).toBe(0)
    expect(clampSelectorPage(0, DOSE_PILL_PAGE_SIZE, 2)).toBe(0)
  })

  // A NaN page (a bad parseInt on a route param, say) must clamp to a real
  // page rather than propagate -- Math.max/Math.min both return NaN the
  // moment either side is NaN.
  it("clamps a non-finite page instead of returning NaN", () => {
    expect(clampSelectorPage(7, DOSE_PILL_PAGE_SIZE, NaN)).toBe(0)
    expect(clampSelectorPage(7, DOSE_PILL_PAGE_SIZE, Infinity)).toBe(1)
  })
})

describe("presetConcentrations", () => {
  it("drops a literal 'other' so it cannot appear beside the custom-entry control", () => {
    expect(presetConcentrations(["0.5%", "Other", "1%"])).toEqual(["0.5%", "1%"])
    expect(presetConcentrations(["0.5%", " other ", "1%"])).toEqual(["0.5%", "1%"])
  })

  it("keeps every real concentration, and tolerates no list at all", () => {
    expect(presetConcentrations(["0.5%", "1%"])).toEqual(["0.5%", "1%"])
    expect(presetConcentrations(null)).toEqual([])
    expect(presetConcentrations(undefined)).toEqual([])
  })
})

describe("pageOfSelection", () => {
  it("finds the page holding the selected value", () => {
    const values = [1, 2, 3, 4, 5, 6, 7]
    expect(pageOfSelection(values, DOSE_PILL_PAGE_SIZE, 6)).toBe(1)
    expect(pageOfSelection(values, DOSE_PILL_PAGE_SIZE, 1)).toBe(0)
  })

  it("falls back to the first page when nothing is selected or the value is gone", () => {
    expect(pageOfSelection([1, 2, 3], DOSE_PILL_PAGE_SIZE, null)).toBe(0)
    expect(pageOfSelection([1, 2, 3], DOSE_PILL_PAGE_SIZE, 99)).toBe(0)
  })
})
