/**
 * The display size, a per-device setting (10.0.0): everything on the page
 * grows or shrinks together, text, spacing, buttons and icons.
 *
 * It scales the root font size, which every rem-based size follows -- nearly
 * all of the app. Browser-style zoom would scale the rest too, but it also
 * scales viewport heights (a full-height panel runs off the screen) and the
 * pointer maths the intraop chart drags with; this does neither.
 *
 * Kept in a cookie, as the theme is, so the server draws the first frame at
 * the chosen size.
 */
export const UI_SCALE_COOKIE = "uiScale"
export const UI_SCALE_MIN = 80
export const UI_SCALE_MAX = 150
export const UI_SCALE_STEP = 5
export const UI_SCALE_DEFAULT = 100

/** A stored value as a percentage on the slider's steps; the default for anything else. */
export function parseUiScale(value: unknown): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  if (!Number.isFinite(number)) return UI_SCALE_DEFAULT
  const stepped = Math.round(number / UI_SCALE_STEP) * UI_SCALE_STEP
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, stepped))
}

/** The root font size for a percentage; none at 100%, so the default stays untouched. */
export function uiScaleFontSize(percent: number): string | undefined {
  return percent === UI_SCALE_DEFAULT ? undefined : `${percent}%`
}

export function applyUiScale(percent: number): void {
  const scale = parseUiScale(percent)
  document.documentElement.style.fontSize = uiScaleFontSize(scale) ?? ""
  document.cookie = `${UI_SCALE_COOKIE}=${scale}; path=/; max-age=31536000; SameSite=Lax`
}
