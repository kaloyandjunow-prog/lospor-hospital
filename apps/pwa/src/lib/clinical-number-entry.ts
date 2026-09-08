import { parseClinicalNumber } from "@/lib/clinical-number"

/**
 * What a clinical number control reports when its value changes.
 *
 * `null` is an explicit clear and reaches the server as one. `undefined` is
 * not usable here: the canonical patch builder drops it as "not in this diff",
 * so a cleared vital stayed on the record while the field showed empty. Shared
 * because every number control on the phone has to agree about that, and two
 * of them had been declaring it separately.
 */
export type ClinicalNumberChange = (value: number | null) => void

/**
 * Decide what confirming a numeric entry means.
 *
 * Confirming an emptied keypad is how a value is removed. Without that, the
 * field fell back to the wheel position, so a figure entered by mistake could
 * be changed but never taken off the record.
 *
 * Returns `null` for a clear, a number to write, or `undefined` when there is
 * nothing to do.
 */
export function resolveNumberEntry(input: {
  entryMode: string
  keypadText: string
  wheelValue: number | undefined
  clamp: (value: number) => number
}): number | null | undefined {
  const { entryMode, keypadText, wheelValue, clamp } = input
  if (entryMode === "keypad" && keypadText.trim() === "") return null
  const typed = entryMode === "keypad" ? parseClinicalNumber(keypadText) : undefined
  const next = typed != null ? clamp(typed) : wheelValue
  return next != null ? next : undefined
}
