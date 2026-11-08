import { ALL_COMPLICATIONS } from "@lospor/core/complications"

// Single source of truth is @lospor/core/complications (shared with
// lospor-app). Every name a record may hold, the retired duplicates included,
// so an old case's line of text still reads item by item.
export const COMPLICATION_ITEMS = ALL_COMPLICATIONS
