/** A tap on a toggle or pill saves almost at once; typing waits out the pause. */
export const DISCRETE_TAP_DEBOUNCE_MS = 300
export const TYPING_DEBOUNCE_MS = 2000

/**
 * Whether this form change was a discrete tap rather than typing.
 *
 * Only booleans can make a change discrete, so only booleans are compared, and
 * they compare with `!==`. This used to `JSON.stringify` both sides of all 106
 * fields on every keystroke -- over 200 serialisations per character, across an
 * object graph that grows as diagnoses, procedures, medications and labs are
 * added, so the form got measurably slower the more of it you filled in.
 *
 * A non-boolean field counts as changed on reference inequality alone:
 * react-hook-form hands back fresh references for edited values, and a false
 * negative here costs only the slower debounce, never a lost save.
 */
export function isDiscreteTapChange(
  current: Record<string, unknown>,
  previous: Record<string, unknown> | null,
): boolean {
  if (!previous) return false
  let changed = 0
  let allBoolean = true
  for (const key of Object.keys(current)) {
    const now = current[key]
    const before = previous[key]
    if (typeof now === "boolean" || typeof before === "boolean") {
      if (now !== before) changed += 1
      continue
    }
    if (now !== before) {
      changed += 1
      allBoolean = false
    }
  }
  return changed > 0 && allBoolean
}

export function autosaveDelayMs(discreteTap: boolean): number {
  return discreteTap ? DISCRETE_TAP_DEBOUNCE_MS : TYPING_DEBOUNCE_MS
}
