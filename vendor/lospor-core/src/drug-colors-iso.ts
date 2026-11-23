/**
 * Default drug colours by group, after the ISO 26825 user-applied syringe
 * label colours (10.8.0) -- the colours an anaesthetist already reads on the
 * syringes. A hospital's own colours (drug-colors.ts, set in Status) win over
 * these; groups the standard does not colour keep the bundled colour.
 *
 *   Induction agents: yellow          Benzodiazepines and sedatives: orange
 *   Opioids: blue                     Neuromuscular blockers: fluorescent red
 *   Neuromuscular reversal: red/white Vasopressors: violet
 *   Hypotensive agents: violet/white  Local anaesthetics: grey
 *   Anticholinergics: green           Antiemetics: salmon
 *
 * Striped labels are drawn as the lighter tint of their colour.
 */
export const ISO_26825_GROUP_COLORS: Readonly<Record<string, string>> = Object.freeze({
  "Intravenous hypnotics / general anesthetics": "#eab308",
  "Sedatives / anxiolytics / alpha-2 agonists": "#f97316",
  "Opioid analgesics": "#38bdf8",
  "Neuromuscular blocking drugs": "#ef4444",
  "Neuromuscular reversal / anticholinergics": "#f87171",
  "Vasoactive drugs - vasopressors / vasoconstrictors": "#8b5cf6",
  "Vasoactive drugs - inotropes / inodilators": "#a78bfa",
  "Vasoactive drugs - antihypertensives / vasodilators": "#c4b5fd",
  "Local/regional anesthetics": "#9ca3af",
  "Antiemetics / prokinetics": "#fa8072",
})

/**
 * Where the standard splits what the library keeps in one group: "Neuromuscular reversal / anticholinergics" holds
 * the reversal agents (red with white stripes, drawn as the lighter red of the group) and the anticholinergics, which
 * have their own colour, green.
 */
export const ISO_26825_DRUG_COLORS: Readonly<Record<string, string>> = Object.freeze({
  "Atropine": "#22c55e",
  "Glycopyrrolate": "#22c55e",
  "Scopolamine / Hyoscine": "#22c55e",
})

/** The ISO 26825 colour of a drug group, or null when the standard gives none. */
export function isoDrugGroupColor(group: string | null | undefined): string | null {
  return group ? ISO_26825_GROUP_COLORS[group] ?? null : null
}

/** The ISO 26825 colour of one drug: its own where the standard splits its group, else its group's. */
export function isoDrugColor(group: string | null | undefined, name: string | null | undefined): string | null {
  return (name ? ISO_26825_DRUG_COLORS[name] : undefined) ?? isoDrugGroupColor(group)
}

/**
 * A second running item of the same group is told apart by a lighter or
 * darker shade of the group's colour (index 0 is the colour itself).
 */
export function shadeForSameGroup(hex: string, index: number): string {
  if (index <= 0) return hex
  const value = Number.parseInt(hex.slice(1), 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  const lighter = index % 2 === 1
  const amount = Math.min(0.6, 0.25 * Math.ceil(index / 2))
  const target = lighter ? 255 : 0
  return `#${channels.map(channel => Math.round(channel + (target - channel) * amount).toString(16).padStart(2, "0")).join("")}`
}

/**
 * The shade of the nth running item of a group for a theme: the second, third... get lighter on the dark theme,
 * where a lighter colour is more readable, and darker on the light theme (index 0 is the colour itself).
 */
export function shadeForSameGroupIn(hex: string, index: number, scheme: "light" | "dark"): string {
  return index <= 0 ? hex : shadeForSameGroup(hex, scheme === "light" ? index * 2 : index * 2 - 1)
}
