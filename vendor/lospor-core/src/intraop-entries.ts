export const COMPLICATION_NOTE_SEPARATOR = " \u2014 "
export const MAX_COMPLICATION_NOTES_LENGTH = 500

export type ParsedComplications = {
  selected: string[]
  notes: string
}

export function formatComplications(selected: readonly string[], notes: string): string | null {
  const complications = selected.join("; ")
  const normalizedNotes = notes.trim().slice(0, MAX_COMPLICATION_NOTES_LENGTH)
  if (complications && normalizedNotes) {
    return `${complications}${COMPLICATION_NOTE_SEPARATOR}${normalizedNotes}`
  }
  return complications || normalizedNotes || null
}

export function addComplicationLabel(
  selected: readonly string[],
  label: string,
): string[] | null {
  return selected.includes(label) ? null : [...selected, label]
}

export function toggleComplicationLabel(selected: readonly string[], label: string): string[] {
  return selected.includes(label)
    ? selected.filter(item => item !== label)
    : [...selected, label]
}

export function parseComplications(
  raw: string,
  knownItems: readonly string[],
): ParsedComplications {
  const separatorIndex = raw.indexOf(COMPLICATION_NOTE_SEPARATOR)
  if (separatorIndex !== -1) {
    return {
      selected: raw.slice(0, separatorIndex).split("; ").filter(Boolean),
      notes: raw.slice(separatorIndex + COMPLICATION_NOTE_SEPARATOR.length),
    }
  }
  const parts = raw.split("; ").filter(Boolean)
  const allKnown = parts.length > 0 && parts.every(part => knownItems.includes(part))
  return allKnown ? { selected: parts, notes: "" } : { selected: [], notes: raw }
}

export type PremedicationDrugIdentity = {
  name: string
  unit: string
}

export function formatPremedicationEntry(
  drug: PremedicationDrugIdentity,
  dose: string,
  route: string,
): string {
  return `${drug.name} ${dose} ${drug.unit} ${route}`.trim()
}

export function addOrReplacePremedicationEntry(
  previous: string,
  drugName: string,
  entry: string,
): string {
  const items = previous
    ? previous.split(";").map(item => item.trim()).filter(Boolean)
    : []
  return [...items.filter(item => !item.startsWith(`${drugName} `)), entry].join("; ")
}

export function buildPremedicationPatch(
  eveningText: string,
  morningText: string,
  overrides?: { evening?: string | null; morning?: string | null },
): { premedicationEvening: string | null; premedicationMorning: string | null } {
  return {
    premedicationEvening: overrides && "evening" in overrides
      ? overrides.evening ?? null
      : eveningText.trim() || null,
    premedicationMorning: overrides && "morning" in overrides
      ? overrides.morning ?? null
      : morningText.trim() || null,
  }
}
