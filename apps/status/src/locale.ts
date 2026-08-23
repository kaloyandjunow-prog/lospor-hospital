export const STATUS_LOCALES = ["bg", "en"] as const
export type StatusLocale = typeof STATUS_LOCALES[number]

export function parseStatusLocale(value: unknown): StatusLocale | null {
  return value === "bg" || value === "en" ? value : null
}

export function statusLocale(value: unknown, fallback: StatusLocale = "bg"): StatusLocale {
  return parseStatusLocale(value) ?? fallback
}

export function localize(locale: StatusLocale, english: string, bulgarian: string): string {
  return locale === "bg" ? bulgarian : english
}

