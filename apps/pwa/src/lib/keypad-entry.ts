/**
 * What the in-app numpad shows after a key (VitalStepper, the preop stepper and
 * ClinicalNumberInput share it).
 *
 * The numpad opens showing the field's current value. The first digit (or point)
 * typed after it opens **replaces** that value, as on the phone's own number
 * entry, instead of being added to its end: "7" over 120 gives 7, not 1207.
 * Back and Clear keep working on what is shown, and end the replacing too.
 */
export function pressKeypadKey(
  current: string,
  key: string,
  { precision, replace }: { precision: number; replace: boolean },
): string {
  if (key === "clear") return ""
  if (key === "back") return current.slice(0, -1)
  const base = replace ? "" : current
  if (key === "." && (precision === 0 || base.includes("."))) return current
  return `${base}${key}`.replace(/^0+(?=\d)/, "")
}
