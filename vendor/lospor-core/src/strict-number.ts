/**
 * A value as a finite number, only when the entire input is numeric text --
 * never a prefix of it.
 *
 * `Number.parseFloat` stops reading at the first character that breaks the
 * pattern and returns whatever it already parsed, so `"70kg"` becomes `70`
 * and `"70junk"` becomes `70` -- a plausible-looking, silently wrong number
 * manufactured from a value that was never purely numeric. (Bare `Number()`
 * does not have this problem on its own -- `Number("70kg")` is already `NaN`
 * -- but a caller reaching for `parseFloat` specifically to avoid `Number()`
 * rejecting a leading `+` or a bare decimal point reintroduces it.)
 * `@lospor/core/labs`'s `parseLabValue` documents the same failure for lab
 * results ("5.2 (H)" losing its flag); this is the same rule for callers that
 * need a strict number rather than labs' further choice to keep non-numeric
 * text as a real, unflagged result.
 */
export function strictFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  const text = String(value ?? "").trim()
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text)) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}
