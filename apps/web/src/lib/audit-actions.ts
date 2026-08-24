export type AuditActionLocale = "bg" | "en"

export type AuditActionDefinition = {
  code: string
  category: string
  labels: Record<AuditActionLocale, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** Accept only the API-owned bilingual action catalog; malformed rows vanish. */
export function parseAuditActionDefinitions(value: unknown): AuditActionDefinition[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap(item => {
    if (!isRecord(item) || !isRecord(item.labels)) return []
    const code = typeof item.code === "string" ? item.code.trim() : ""
    const category = typeof item.category === "string" ? item.category.trim() : ""
    const bg = typeof item.labels.bg === "string" ? item.labels.bg.trim() : ""
    const en = typeof item.labels.en === "string" ? item.labels.en.trim() : ""
    if (!code || !category || !bg || !en || seen.has(code)) return []
    seen.add(code)
    return [{ code, category, labels: { bg, en } }]
  })
}

export function auditActionLabel(
  definitions: readonly AuditActionDefinition[],
  code: string,
  locale: string,
): string {
  const definition = definitions.find(item => item.code === code)
  if (!definition) return code
  return locale.toLowerCase().startsWith("bg")
    ? definition.labels.bg
    : definition.labels.en
}
