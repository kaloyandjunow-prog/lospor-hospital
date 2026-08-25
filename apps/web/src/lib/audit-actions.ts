export type AuditLocale = "bg" | "en"

export type AuditActionDefinition = Readonly<{
  code: string
  category: string
  labels: Readonly<{ bg: string; en: string }>
}>

export type SafeAuditRow = Readonly<{
  id: string
  createdAt: string
  action: string
  user: Readonly<{
    name?: string | null
    firstName?: string | null
    lastName?: string | null
    title?: string | null
  }>
}>

export type AuditPage = Readonly<{
  logs: SafeAuditRow[]
  actions: AuditActionDefinition[]
  total: number
  page: number
  pageSize: number
}>

const CATEGORIES = new Set([
  "ACCOUNT", "AUTHENTICATION", "CASE", "CENTRAL", "CLINICAL_RULES",
  "INSTITUTION", "MAINTENANCE", "RESEARCH", "SECURITY",
])

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string"
}

/** Strict runtime parser for the API-owned catalog and privacy-safe rows. */
export function parseAuditPage(value: unknown): AuditPage | null {
  const root = record(value)
  if (!root || root.schemaVersion !== 1 || !Array.isArray(root.actions) || !Array.isArray(root.logs)) {
    return null
  }
  if (![root.total, root.page].every(item =>
    typeof item === "number" && Number.isSafeInteger(item) && item >= 0)
    || typeof root.pageSize !== "number" || !Number.isSafeInteger(root.pageSize)
    || root.pageSize < 1) {
    return null
  }

  const actions: AuditActionDefinition[] = []
  const seen = new Set<string>()
  for (const candidate of root.actions) {
    const action = record(candidate)
    const labels = record(action?.labels)
    if (!action || typeof action.code !== "string" || !action.code
      || typeof action.category !== "string" || !CATEGORIES.has(action.category)
      || !labels || typeof labels.bg !== "string" || !labels.bg.trim()
      || typeof labels.en !== "string" || !labels.en.trim()
      || seen.has(action.code)) {
      return null
    }
    seen.add(action.code)
    actions.push({
      code: action.code,
      category: action.category,
      labels: { bg: labels.bg, en: labels.en },
    })
  }

  const logs: SafeAuditRow[] = []
  for (const candidate of root.logs) {
    const row = record(candidate)
    const user = record(row?.user)
    if (!row || typeof row.id !== "string" || !row.id
      || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))
      || typeof row.action !== "string" || !row.action || !user
      || !nullableString(user.name) || !nullableString(user.firstName)
      || !nullableString(user.lastName) || !nullableString(user.title)) {
      return null
    }
    // Deliberately reconstruct the row. Any legacy detail/entity fields in an
    // unexpected response cannot flow into the component by object spreading.
    logs.push({
      id: row.id,
      createdAt: row.createdAt,
      action: row.action,
      user: {
        name: user.name as string | null | undefined,
        firstName: user.firstName as string | null | undefined,
        lastName: user.lastName as string | null | undefined,
        title: user.title as string | null | undefined,
      },
    })
  }

  return {
    logs,
    actions,
    total: root.total as number,
    page: root.page as number,
    pageSize: root.pageSize as number,
  }
}

export function auditActionLabel(
  actions: readonly AuditActionDefinition[],
  code: string,
  locale: AuditLocale,
  unknownLabel: string,
): string {
  return actions.find(action => action.code === code)?.labels[locale] ?? unknownLabel
}
