import { complicationDisplayLabel, displayNamedOption } from "@lospor/core/clinical-display"
import { ALL_COMPLICATIONS, canonicalComplicationLabel } from "@lospor/core/complications"
import type { LibraryOption } from "@lospor/core/option-library"

/**
 * A clinical event's name in the reader's language (9.14.2).
 *
 * Events are saved under their English label. A whole catalogue name was
 * already shown translated, but a name with a detail after it ("Hypotension
 * (treated)") and the labels an app writes itself (the PWA's "Anaesthesia
 * start") stayed in English. The detail is kept as typed.
 */
export function clinicalEventName(
  label: string,
  options: readonly LibraryOption[],
  locale: string,
  writtenByApp: Readonly<Record<string, string>>,
): string {
  // A complication by the complications catalogue's name, as its list and the
  // event log name it (10.1.0) -- whole, since its name may end in "(...)".
  if (ALL_COMPLICATIONS.includes(canonicalComplicationLabel(label))) return complicationDisplayLabel(label, locale)
  const open = label.indexOf(" (")
  const base = open >= 0 ? label.slice(0, open) : label
  const detail = open >= 0 ? label.slice(open) : ""
  return `${writtenByApp[base] ?? displayNamedOption("INTRAOP_EVENT", options, base, locale)}${detail}`
}
