/**
 * A hospital's own drug colours (10.0.0), chosen in Status: a colour for a
 * drug group, and a colour for one drug that overrides its group's. One
 * colour per drug: its bolus and its infusion are drawn alike.
 *
 * Only presentation. Nothing recorded carries these colours: every case,
 * finished ones included, is drawn in the colours in use when it is shown.
 */

export type DrugColorScope = "GROUP" | "DRUG"

/** The colours in use: group name or drug name (the English label) to #rrggbb. */
export type DrugColorMap = {
  groups: Readonly<Record<string, string>>
  drugs: Readonly<Record<string, string>>
}

export const EMPTY_DRUG_COLORS: DrugColorMap = Object.freeze({ groups: Object.freeze({}), drugs: Object.freeze({}) })

export type PaletteColor = { hex: string; labelEn: string; labelBg: string }

const bright = (hex: string, labelEn: string, labelBg: string): PaletteColor => ({ hex, labelEn, labelBg })

/**
 * The 32 colours Status offers: sixteen hues, each bright and deep. A free
 * colour can be chosen instead; every colour, from here or not, is drawn
 * through drugColorTones so its text stays readable in both themes.
 */
export const DRUG_COLOR_PALETTE: readonly PaletteColor[] = Object.freeze([
  bright("#ef4444", "Red", "Червено"),
  bright("#f97316", "Orange", "Оранжево"),
  bright("#f59e0b", "Amber", "Кехлибарено"),
  bright("#eab308", "Yellow", "Жълто"),
  bright("#84cc16", "Lime", "Лимоненозелено"),
  bright("#22c55e", "Green", "Зелено"),
  bright("#10b981", "Emerald", "Изумрудено"),
  bright("#14b8a6", "Teal", "Синьозелено"),
  bright("#06b6d4", "Cyan", "Тюркоазено"),
  bright("#0ea5e9", "Sky blue", "Небесносиньо"),
  bright("#3b82f6", "Blue", "Синьо"),
  bright("#6366f1", "Indigo", "Индиго"),
  bright("#8b5cf6", "Violet", "Виолетово"),
  bright("#d946ef", "Fuchsia", "Фуксия"),
  bright("#ec4899", "Pink", "Розово"),
  bright("#64748b", "Grey", "Сиво"),
  bright("#991b1b", "Dark red", "Тъмночервено"),
  bright("#9a3412", "Dark orange", "Тъмнооранжево"),
  bright("#92400e", "Brown", "Кафяво"),
  bright("#854d0e", "Olive", "Маслинено"),
  bright("#3f6212", "Dark lime", "Тъмно лимоненозелено"),
  bright("#166534", "Dark green", "Тъмнозелено"),
  bright("#065f46", "Dark emerald", "Тъмно изумрудено"),
  bright("#115e59", "Dark teal", "Тъмно синьозелено"),
  bright("#155e75", "Dark cyan", "Тъмно тюркоазено"),
  bright("#075985", "Dark sky blue", "Тъмно небесносиньо"),
  bright("#1e40af", "Dark blue", "Тъмносиньо"),
  bright("#3730a3", "Dark indigo", "Тъмно индиго"),
  bright("#5b21b6", "Dark violet", "Тъмновиолетово"),
  bright("#86198f", "Plum", "Сливово"),
  bright("#9d174d", "Dark pink", "Тъмнорозово"),
  bright("#1e293b", "Dark grey", "Тъмносиво"),
])

const HEX = /^#[0-9a-f]{6}$/

/** A colour as stored: #rrggbb, lower case. Anything else is null. */
export function normalizeDrugColor(value: unknown): string | null {
  if (typeof value !== "string") return null
  let text = value.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(text)) text = `#${text.slice(1).split("").map(char => char + char).join("")}`
  return HEX.test(text) ? text : null
}

/** The drug's own colour, else its group's, else null (the bundled colours apply). */
export function resolveDrugColor(colors: DrugColorMap | null | undefined, group: string | null | undefined, name: string | null | undefined): string | null {
  if (!colors) return null
  return (name ? colors.drugs[name] : undefined) ?? (group ? colors.groups[group] : undefined) ?? null
}

/** The 500 shade of each colour the bundled style classes use. */
const SHADE_500: Readonly<Record<string, string>> = {
  red: "#ef4444", orange: "#f97316", amber: "#f59e0b", yellow: "#eab308", lime: "#84cc16",
  green: "#22c55e", emerald: "#10b981", teal: "#14b8a6", cyan: "#06b6d4", sky: "#0ea5e9",
  blue: "#3b82f6", indigo: "#6366f1", violet: "#8b5cf6", purple: "#a855f7", fuchsia: "#d946ef",
  pink: "#ec4899", rose: "#f43f5e", slate: "#64748b", gray: "#6b7280", zinc: "#71717a", stone: "#78716c",
}

/** A bundled colour as a plain value: a hex as it is, style classes by their hue. */
export function bundledColorHex(color: string | null | undefined): string | null {
  if (!color) return null
  const hex = normalizeDrugColor(color)
  if (hex) return hex
  const name = color.match(/\bbg-([a-z]+)-\d+/)?.[1]
  return name ? SHADE_500[name] ?? null : null
}

type Rgb = [number, number, number]

function rgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map(part => Math.round(Math.min(255, Math.max(0, part))).toString(16).padStart(2, "0")).join("")}`
}

function mix(from: string, to: string, amount: number): string {
  const a = rgb(from)
  const b = rgb(to)
  return toHex([0, 1, 2].map(index => a[index] + (b[index] - a[index]) * amount) as Rgb)
}

function luminance(hex: string): number {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = rgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** The WCAG contrast ratio of two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** The colour moved towards `toward` only as far as it must to reach `ratio` against `against`. */
function untilReadable(hex: string, toward: string, against: string, ratio: number): string {
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mix(hex, toward, step / 20)
    if (contrastRatio(candidate, against) >= ratio) return candidate
  }
  return toward
}

export type DrugTone = {
  /** The chip's fill. */
  bg: string
  /** Text on that fill, at least 4.5:1 against it. */
  text: string
  border: string
  /** The colour itself on the page (bars, text without a fill), at least 3:1 against it. */
  solid: string
}

/** The surfaces the tones are worked out against. */
const LIGHT_SURFACE = "#ffffff"
const DARK_SURFACE = "#1a1a1a"

/**
 * How a colour is drawn in each theme. Any colour comes out readable: a pale
 * one is darkened for the light theme, a deep one lightened for the dark.
 */
export function drugColorTones(color: string): { light: DrugTone; dark: DrugTone } {
  const hex = normalizeDrugColor(color) ?? "#64748b"
  const lightBg = mix(hex, LIGHT_SURFACE, 0.86)
  const darkBg = mix(hex, DARK_SURFACE, 0.8)
  return {
    light: {
      bg: lightBg,
      text: untilReadable(hex, "#000000", lightBg, 4.5),
      border: mix(untilReadable(hex, "#000000", LIGHT_SURFACE, 1.5), LIGHT_SURFACE, 0.45),
      solid: untilReadable(hex, "#000000", LIGHT_SURFACE, 3),
    },
    dark: {
      bg: darkBg,
      text: untilReadable(hex, "#ffffff", darkBg, 4.5),
      border: mix(untilReadable(hex, "#ffffff", DARK_SURFACE, 1.5), DARK_SURFACE, 0.4),
      solid: untilReadable(hex, "#ffffff", DARK_SURFACE, 3),
    },
  }
}

/** Reads the colours as the API sends them; anything malformed is left out. */
export function parseDrugColorMap(value: unknown): DrugColorMap {
  const record = (input: unknown): Record<string, string> => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {}
    const out: Record<string, string> = {}
    for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
      const hex = normalizeDrugColor(raw)
      if (key && hex) out[key] = hex
    }
    return out
  }
  const object = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return { groups: record(object.groups), drugs: record(object.drugs) }
}
