export type Lang = "bg" | "en"
export type Page = { name: string; position: number; title: Record<Lang, string>; body: Record<Lang, string> }

export const t = (lang: Lang, en: string, bg: string) => (lang === "bg" ? bg : en)
const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, " ")
export const table = (head: string[], rows: string[][]) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map(row => `| ${row.map(cell).join(" | ")} |`)].join("\n")

/** A number as the reader's language writes it: a decimal comma in Bulgarian. */
export const numFor = (lang: Lang, value: number) => (lang === "bg" ? String(value).replace(".", ",") : String(value))

export function groupBy<T>(items: readonly T[], key: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item])
  return [...map.entries()]
}
