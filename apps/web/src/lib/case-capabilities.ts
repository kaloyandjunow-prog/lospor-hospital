/**
 * Moved to @lospor/core/case-capabilities, where mobile reads it too --
 * mobile previously derived edit permission from `status !== "COMPLETE"`
 * alone and had the identical gap this closes. Re-exported here so this
 * app's existing import path keeps working.
 */
export { caseIsWritable } from "@lospor/core/case-capabilities"
