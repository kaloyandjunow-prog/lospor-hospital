import { displayNamedOption } from "@lospor/core/clinical-display"
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
  const open = label.indexOf(" (")
  const base = open >= 0 ? label.slice(0, open) : label
  const detail = open >= 0 ? label.slice(open) : ""
  return `${writtenByApp[base] ?? displayNamedOption("INTRAOP_EVENT", options, base, locale)}${detail}`
}
