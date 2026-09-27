/**
 * The complications field with newly charted labels added, each once, or null
 * when every label is already there. The field is a "; "-separated list typed
 * by hand as well as filled from the chart, so existing entries are kept as
 * written.
 */
export function appendComplications(current: string | null | undefined, labels: readonly string[]): string | null {
  const existing = (current ?? "").split(";").map(item => item.trim()).filter(Boolean)
  const added = labels.filter(label => !existing.includes(label))
  return added.length === 0 ? null : [...existing, ...added].join("; ")
}
