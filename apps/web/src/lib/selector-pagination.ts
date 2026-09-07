/**
 * Moved to @lospor/core/selector-pagination, where mobile reads it too --
 * mobile previously re-derived the same paging inline with the page sizes as
 * bare literals. Re-exported here so this app's existing import path keeps
 * working.
 */
export {
  CONCENTRATION_PILL_PAGE_SIZE,
  DOSE_PILL_PAGE_SIZE,
  clampSelectorPage,
  pageOfSelection,
  presetConcentrations,
  selectorPage,
  selectorPageCount,
} from "@lospor/core/selector-pagination"
