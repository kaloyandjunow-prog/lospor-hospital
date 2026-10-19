import { DRUG_CATALOG } from "./intraop-drugs"

/**
 * Each drug group's colour, as its drugs carry it (style classes). Infusions
 * are grouped by the same groups and shown in the same colours.
 */
export const DRUG_GROUP_COLORS: Readonly<Record<string, string>> = Object.freeze(
  DRUG_CATALOG.reduce<Record<string, string>>((colors, entry) => {
    colors[entry.category] ??= entry.color
    return colors
  }, {}),
)

/** The 500 shade of each colour the group classes use. */
const SHADE_500: Readonly<Record<string, string>> = {
  red: "#ef4444", orange: "#f97316", amber: "#f59e0b", lime: "#84cc16", emerald: "#10b981",
  teal: "#14b8a6", cyan: "#06b6d4", sky: "#0ea5e9", blue: "#3b82f6", indigo: "#6366f1",
  violet: "#8b5cf6", purple: "#a855f7", fuchsia: "#d946ef", pink: "#ec4899", rose: "#f43f5e",
}

/** A group's colour as a plain value, for surfaces that cannot take classes (the phone). */
export function drugGroupColorHex(group: string): string | null {
  const name = DRUG_GROUP_COLORS[group]?.match(/\bbg-([a-z]+)-\d+/)?.[1]
  return name ? SHADE_500[name] ?? null : null
}
