import { catalogOptions } from "../catalog"
import { FLUID_DISPLAY_NAMES, MEDICATION_NAMES_BG } from "../catalog/medication-names-bg"
import type { LibraryCategory } from "../option-contracts"
import { normalizeOptionCode } from "../option-aliases"

/**
 * Which catalogues show Bulgarian names to a Bulgarian reader (Settings → UI).
 * Off, a catalogue shows its international (English) names, as before.
 */
export type BulgarianNameSwitches = {
  premed: boolean
  drugs: boolean
  infusions: boolean
  agents: boolean
  fluids: boolean
}

export const BULGARIAN_NAME_SWITCH_KEYS = ["premed", "drugs", "infusions", "agents", "fluids"] as const

export const NO_BULGARIAN_NAMES: Readonly<BulgarianNameSwitches> = Object.freeze({
  premed: false, drugs: false, infusions: false, agents: false, fluids: false,
})

/** The option category each switch covers. */
const SWITCH_FOR_CATEGORY: Readonly<Record<string, keyof BulgarianNameSwitches>> = {
  PREMED_DRUG: "premed",
  INTRAOP_DRUG: "drugs",
  INTRAOP_INFUSION: "infusions",
  INHALATIONAL_AGENT: "agents",
  INTRAOP_FLUID: "fluids",
}

/*
 * The switches belong to the reader, and every name on screen (menus, chart,
 * summary, print) goes through clinical display, deep inside pure functions.
 * Rather than thread them through each call, the app sets them here once
 * from its preferences, the way it sets the language, and screens that keep
 * names in memos subscribe to the version. A server never sets them, so
 * anything rendered there keeps the international names.
 */
let current: BulgarianNameSwitches = { ...NO_BULGARIAN_NAMES }
let version = 0
const listeners = new Set<() => void>()

export function setBulgarianNameSwitches(next: Partial<BulgarianNameSwitches> | null | undefined): void {
  const normalized = { ...NO_BULGARIAN_NAMES }
  for (const key of BULGARIAN_NAME_SWITCH_KEYS) normalized[key] = next?.[key] === true
  if (BULGARIAN_NAME_SWITCH_KEYS.every(key => normalized[key] === current[key])) return
  current = normalized
  version += 1
  for (const listener of listeners) listener()
}

export function bulgarianNameSwitches(): Readonly<BulgarianNameSwitches> {
  return current
}

/** Changes whenever a switch does; for `useSyncExternalStore`. */
export function bulgarianNamesVersion(): number {
  return version
}

export function subscribeBulgarianNames(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * The names a catalogue option is shown by, or null when its category has no
 * switch. `catalogName` is the stored catalogue name; neither name replaces it.
 */
export function catalogDisplayNames(
  category: string,
  catalogName: string,
  switches: Readonly<BulgarianNameSwitches> = current,
): { en: string; bg: string } | null {
  const key = SWITCH_FOR_CATEGORY[category]
  if (!key) return null
  if (category === "INTRAOP_FLUID") {
    const names = FLUID_DISPLAY_NAMES[catalogName]
    const en = names?.en ?? catalogName
    return { en, bg: switches.fluids && names ? names.bg : en }
  }
  const bg = switches[key] ? MEDICATION_NAMES_BG[catalogName] : undefined
  return { en: catalogName, bg: bg ?? catalogName }
}

/** The kind of chart entry a timeline event names, by event type. */
const CATEGORY_FOR_EVENT: Readonly<Record<string, string>> = {
  drug: "INTRAOP_DRUG",
  infusion_start: "INTRAOP_INFUSION", infusion_rate: "INTRAOP_INFUSION", infusion_stop: "INTRAOP_INFUSION",
  fluid_start: "INTRAOP_FLUID", fluid_rate: "INTRAOP_FLUID", fluid_end: "INTRAOP_FLUID",
  agent_start: "INHALATIONAL_AGENT", agent_stop: "INHALATIONAL_AGENT",
}

/**
 * A stored drug, infusion, fluid or agent name as the reader sees it, with the
 * switches given explicitly (for code that keeps names in memos). A name the
 * catalogue does not know is shown as stored.
 */
export function displayedCatalogName(
  category: string,
  catalogName: string,
  locale: string,
  switches: Readonly<BulgarianNameSwitches>,
): string {
  // The stored name, or an older spelling of it, as its catalogue entry is named.
  const code = normalizeOptionCode(category as LibraryCategory, catalogName)
  const lower = catalogName.toLocaleLowerCase("en")
  const entry = catalogOptions(category as LibraryCategory)
    .find(option => option.value === code || option.label.toLocaleLowerCase("en") === lower)
  const names = catalogDisplayNames(category, entry?.label ?? catalogName, switches)
  if (!names) return catalogName
  return locale.toLowerCase().startsWith("bg") ? names.bg : names.en
}

/** The same, for a timeline event by its type; other events keep their name. */
export function displayedEventName(
  eventType: string,
  name: string,
  locale: string,
  switches: Readonly<BulgarianNameSwitches>,
): string {
  const category = CATEGORY_FOR_EVENT[eventType]
  return category ? displayedCatalogName(category, name, locale, switches) : name
}
