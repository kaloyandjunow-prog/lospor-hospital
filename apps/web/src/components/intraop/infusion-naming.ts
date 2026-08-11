/**
 * Local anaesthetic infusions are stored under a name carrying their strength —
 * "Ropivacaine 0.2%" rather than "Ropivacaine" — because the strength is part of
 * what was hung and the chart has always displayed it that way.
 *
 * Every lookup against the drug library has to undo that first. The library is
 * keyed on the drug, and its entry is what supplies the rate limits and the
 * available concentrations, so failing to strip the suffix does not throw: it
 * silently falls through to a default configuration and offers the wrong range
 * for the drug actually running.
 */

/**
 * The library key for an infusion, with any stored concentration suffix removed.
 *
 * Only removes the suffix when it is genuinely this entry's own concentration,
 * so a drug whose real name happens to end in something percentage-shaped is
 * left alone.
 */
export function baseInfusionName(name: string, concentration?: string | null): string {
  if (!concentration) return name
  if (!name.endsWith(concentration)) return name
  // Drop the concentration and the single space before it.
  const trimmed = name.slice(0, -(concentration.length + 1))
  return trimmed.length > 0 ? trimmed : name
}
