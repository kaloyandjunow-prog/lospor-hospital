/**
 * When a quiet connection stops being normal (1.5.6).
 *
 * The overview map and the to-do list read the same numbers, so a box turns
 * amber exactly when its to-do item appears.
 */

const HOUR_MS = 60 * 60_000

/** A hospital feed sends laboratory results around the clock; a whole day of silence is worth a look. */
export const EHR_QUIET_WARN_MS = 24 * HOUR_MS
/** Three days covers any weekend. Silence beyond that is a broken feed. */
export const EHR_QUIET_BAD_MS = 72 * HOUR_MS
/** A case still waiting for Central after two days is stuck, not queued. */
export const CENTRAL_WAIT_WARN_MS = 48 * HOUR_MS
/** How long a new administrator stays on the to-do list. */
export const NEW_ADMINISTRATOR_NOTICE_MS = 7 * 24 * HOUR_MS
