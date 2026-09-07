import { AGENT_CATALOG } from "./inhalational-agents"
import { DRUG_CATALOG } from "./intraop-drugs"
import { FLUID_CATALOG } from "./intraop-fluids"
import { INFUSION_CATALOG } from "./intraop-infusions"

/**
 * Name -> WHO ATC lookup over the four intraoperative catalogs.
 *
 * The catalogs carry the code; this resolves it back from what a stored event
 * actually says. Both halves are needed. A client that reads the option
 * library sends the code with the event and never comes near this. But three
 * kinds of event reach the server without one: those written by an older
 * client build, those recorded before the codes existed at all, and fluid and
 * volatile-agent events, which no client has ever attached a code to. Looking
 * the name up server-side is what makes those rows codeable too, and is why a
 * historic case can be brought forward by re-resolving rather than re-entered.
 *
 * The label is matched, not parsed: this never infers a code from a drug name
 * it does not recognise. An unknown name returns undefined and the event stays
 * honestly uncoded.
 */

const byName = new Map<string, string>()
const conflicts: { name: string; codes: string[] }[] = []

function normalize(name: string): string {
  return name.trim().toLocaleLowerCase("en").replace(/\s+/g, " ")
}

function slug(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

function register(name: string, atcCode: string | undefined) {
  if (!atcCode) return
  for (const key of [normalize(name), normalize(slug(name))]) {
    const existing = byName.get(key)
    // The same substance recorded on two screens must not code two ways. A
    // bolus of propofol and an infusion of propofol are one drug, and the
    // register would be lying if a query for propofol answered differently
    // depending on which button the anaesthetist pressed. Collected rather
    // than thrown so a mistake surfaces as a named test failure instead of an
    // import-time crash somewhere unrelated.
    if (existing && existing !== atcCode) {
      conflicts.push({ name, codes: [existing, atcCode] })
      continue
    }
    byName.set(key, atcCode)
  }
}

for (const entry of DRUG_CATALOG) register(entry.name, entry.atcCode)
for (const entry of INFUSION_CATALOG) register(entry.name, entry.atcCode)
for (const entry of FLUID_CATALOG) register(entry.name, entry.atcCode)
for (const entry of AGENT_CATALOG) {
  register(entry.label, entry.atcCode)
  register(entry.value, entry.atcCode)
}

/** Any catalog name that resolves to two different ATC codes. Must stay empty. */
export const INTRAOP_ATC_CONFLICTS: readonly { name: string; codes: string[] }[] = conflicts

/** Every distinct ATC code used by the intraoperative catalogs. */
export const INTRAOP_ATC_CODES: readonly string[] = [...new Set(byName.values())].sort()

/**
 * One row per substance the intraoperative catalogs can record, with the ATC
 * code where one exists. Ordered by name so a seed built from it is stable.
 *
 * This is the list a concept-map seed walks: it is the complete set of drug
 * names the register can produce from its own buttons, which is what makes the
 * mapping of intraoperative drugs reviewable as a whole rather than one
 * discovered row at a time.
 */
export const INTRAOP_DRUG_CODE_ENTRIES: readonly { name: string; atcCode?: string }[] = (() => {
  const entries = new Map<string, { name: string; atcCode?: string }>()
  const add = (name: string, atcCode?: string) => {
    if (!entries.has(name)) entries.set(name, atcCode ? { name, atcCode } : { name })
  }
  for (const entry of DRUG_CATALOG) add(entry.name, entry.atcCode)
  for (const entry of INFUSION_CATALOG) add(entry.name, entry.atcCode)
  for (const entry of FLUID_CATALOG) add(entry.name, entry.atcCode)
  for (const entry of AGENT_CATALOG) add(entry.label, entry.atcCode)
  return [...entries.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
})()

// The web timetable names a running infusion after the drug plus its
// concentration ("Propofol 1%"), because that is what a clinician needs to
// read off the chart. The concentration is also stored in its own field, so
// dropping it here loses nothing and lets the drug behind the label be found.
const TRAILING_CONCENTRATION =
  /\s+\d+(?:[.,]\d+)?\s*(?:%|mg\/m[lL]|mcg\/m[lL]|µg\/m[lL]|units?\/m[lL]|IU\/m[lL])$/

/**
 * Resolve the WHO ATC code for an intraoperative drug, infusion, fluid or
 * volatile agent by the name the event carries. Returns undefined for a name
 * that is not in the catalogs, or for the three blood products that have no
 * ATC code at all.
 */
export function intraopAtcCode(name: string | null | undefined): string | undefined {
  if (!name) return undefined
  const direct = byName.get(normalize(name))
  if (direct) return direct
  const trimmed = name.replace(TRAILING_CONCENTRATION, "")
  if (trimmed !== name) {
    const stripped = byName.get(normalize(trimmed))
    if (stripped) return stripped
  }
  return byName.get(normalize(slug(name)))
}
