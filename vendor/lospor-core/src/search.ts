export type ClinicalSearchKind = "icd10" | "procedure" | "medication"

export const CLINICAL_SEARCH_MIN_LENGTH: Readonly<Record<ClinicalSearchKind, number>> = {
  icd10: 2,
  procedure: 3,
  medication: 2,
}

export type ClinicalSearchLocale = "en" | "bg"

export type Icd10SearchResult = {
  code: string
  description: string
  descriptionBg?: string
  display?: string
  system?: string
}

export type ProcedureSearchResult = {
  code: string
  description: string
  group: string
  domain: string
}

export type MedicationSearchResult = {
  id?: string
  name: string
  inn?: string
  form?: string
  strength?: string
  atc?: string
  atcCode?: string
}

// ─── ICD-10 ranking ──────────────────────────────────────────────────────────
//
// This lived in the API and ran only against Postgres, so the mobile app could
// not reproduce it offline without a second implementation — and two
// implementations of diagnosis ranking would drift silently, one phone quietly
// offering a different code than the web. It is framework-free, so it belongs
// here where the API and both clients read the same copy.

/** A vocabulary row, from the database or the bundled offline copy. */
export type Icd10SearchRow = {
  code: string
  labelEn: string
  labelBg?: string | null
}

/** Below this query length, labels match on prefix rather than substring. */
export const ICD10_LABEL_PREFIX_MAX_LENGTH = 4

/** Above this many code hits, the query is treated as a code lookup. */
export const ICD10_CODE_CONFIDENCE = 8

export const ICD10_CODE_TAKE = 20
export const ICD10_LABEL_TAKE = 15

/** "I21", "J44" — a letter followed by a digit reads as a code, not a word. */
export function isIcd10CodeLikeQuery(query: string): boolean {
  return /^[A-TV-Z][0-9]/i.test(query.trim())
}

export function formatIcd10Result(row: Icd10SearchRow, useBg: boolean): Icd10SearchResult {
  const labelBg = row.labelBg?.trim() || undefined
  const label = useBg && labelBg ? labelBg : row.labelEn
  return {
    code: row.code,
    description: row.labelEn,
    ...(labelBg ? { descriptionBg: labelBg } : {}),
    display: `${row.code} - ${label}`,
    system: "ICD-10",
  }
}

/** Flattens ranked groups in order, first occurrence of a code winning. */
export function mergeIcd10Results(
  groups: Icd10SearchRow[][],
  useBg: boolean,
  limit = ICD10_CODE_TAKE,
): Icd10SearchResult[] {
  const seen = new Set<string>()
  const results: Icd10SearchResult[] = []

  for (const group of groups) {
    for (const row of group) {
      if (seen.has(row.code)) continue
      seen.add(row.code)
      results.push(formatIcd10Result(row, useBg))
      if (results.length >= limit) return results
    }
  }

  return results
}

/** Whether a label matches, using the same prefix/substring rule as the API. */
export function icd10LabelMatches(label: string | null | undefined, query: string): boolean {
  if (!label) return false
  const term = query.trim().toLowerCase()
  const value = label.toLowerCase()
  return term.length < ICD10_LABEL_PREFIX_MAX_LENGTH
    ? value.startsWith(term)
    : value.includes(term)
}

/**
 * The candidate groups, in priority order, for a query over a full row set.
 *
 * Mirrors the API route's query plan exactly: codes by prefix; then, unless the
 * query already looks like a code, Bulgarian labels (when the locale is bg),
 * codes again, then English labels. Rows must be ordered by code so that the
 * per-group caps select the same rows the database would.
 */
export function selectIcd10Candidates(
  rows: Icd10SearchRow[],
  query: string,
  locale: ClinicalSearchLocale = "en",
): Icd10SearchRow[][] {
  const trimmed = query.trim()
  if (trimmed.length < CLINICAL_SEARCH_MIN_LENGTH.icd10) return []

  const codePrefix = trimmed.toUpperCase()
  const byCode = rows
    .filter(row => row.code.toUpperCase().startsWith(codePrefix))
    .slice(0, ICD10_CODE_TAKE)

  if (isIcd10CodeLikeQuery(trimmed) || byCode.length >= ICD10_CODE_CONFIDENCE) {
    return [byCode]
  }

  const byBgLabel = locale === "bg"
    ? rows.filter(row => icd10LabelMatches(row.labelBg, trimmed)).slice(0, ICD10_LABEL_TAKE)
    : []
  const byEnLabel = rows
    .filter(row => icd10LabelMatches(row.labelEn, trimmed))
    .slice(0, ICD10_LABEL_TAKE)

  // The synonym group the API also queries is intentionally absent: the
  // Icd10Synonym table is empty, so it contributes nothing to either side.
  return [byBgLabel, byCode, byEnLabel]
}

/** Full offline search over a row set — what mobile calls with no network. */
export function searchIcd10(
  rows: Icd10SearchRow[],
  query: string,
  locale: ClinicalSearchLocale = "en",
  limit = ICD10_CODE_TAKE,
): Icd10SearchResult[] {
  return mergeIcd10Results(selectIcd10Candidates(rows, query, locale), locale === "bg", limit)
}

// ─── Procedure ranking ───────────────────────────────────────────────────────

export type ProcedureSearchRow = {
  code: string
  group: string
  domain: string
  description: string
  /**
   * Every distinct word from every description in this group, present only on
   * the bundled offline rows.
   *
   * Online, a query is matched against all ~82,000 PCS descriptions; the
   * offline copy keeps one row per group, so without this a group reachable
   * only through a sibling code's wording would vanish when the network did —
   * "resection" stopped finding Gastrectomy. Costs ~100 KB and restores it.
   */
  terms?: string
}

/**
 * Groups a department actually schedules, floated to the top of results.
 *
 * Shared rather than duplicated so the offline bundle ranks the same way the
 * server does — a different order offline would mean the clinician picking a
 * different procedure depending on the network.
 */
export const PROCEDURE_COMMON_GROUPS: ReadonlySet<string> = new Set([
  "Cholecystectomy", "Appendectomy", "Colectomy", "Gastrectomy",
  "Hernia repair procedures", "Mastectomy", "Thyroidectomy", "Splenectomy",
  "Hip replacement procedures", "Knee replacement procedures",
  "Coronary artery bypass graft (CABG)", "Cardiac valve procedures",
  "Caesarean section", "Hysterectomy",
  "Hip fracture repair", "Knee arthroscopy procedures",
  "Craniotomy procedures", "Laminectomy procedures", "Discectomy",
  "Nephrectomy", "Prostatectomy", "Cystectomy",
  "Lung resection procedures", "Lobectomy",
  "Aortic aneurysm repair", "Carotid endarterectomy",
  "Tonsillectomy and/or adenoidectomy", "Cataract removal",
  "Amputation of lower extremity", "Skin graft procedures",
])

const PROCEDURE_SCORE_COMMON = 2000
const PROCEDURE_SCORE_GROUP = 500
const PROCEDURE_SCORE_CODE = 200
const PROCEDURE_SCORE_PREFIX = 100

export function procedureScore(row: ProcedureSearchRow, query: string): number {
  const q = query.trim().toLowerCase()
  const group = row.group.toLowerCase()
  return (PROCEDURE_COMMON_GROUPS.has(row.group) ? PROCEDURE_SCORE_COMMON : 0)
    + (group.includes(q) ? PROCEDURE_SCORE_GROUP : 0)
    + (row.code.toLowerCase().startsWith(q) ? PROCEDURE_SCORE_CODE : 0)
    + (group.startsWith(q) ? PROCEDURE_SCORE_PREFIX : 0)
}

/**
 * One result per procedure group, best-scoring representative, highest first.
 *
 * Callers pass whatever row set they have: the API passes the full PCS table,
 * mobile passes the bundled one-row-per-group copy. The scoring is identical;
 * see `@lospor/core/vocabulary` for what the reduced set can and cannot match.
 */
export function searchProcedures(
  rows: readonly ProcedureSearchRow[],
  query: string,
  limit = 100,
): ProcedureSearchRow[] {
  const q = query.trim().toLowerCase()
  if (q.length < CLINICAL_SEARCH_MIN_LENGTH.procedure) return []

  const bestPerGroup = new Map<string, { row: ProcedureSearchRow; score: number }>()
  for (const row of rows) {
    const matches = row.description.toLowerCase().includes(q)
      || row.group.toLowerCase().includes(q)
      || row.domain.toLowerCase().includes(q)
      || row.code.toLowerCase().startsWith(q)
      || (row.terms !== undefined && row.terms.includes(q))
    if (!matches) continue

    const score = procedureScore(row, q)
    const key = row.group.toLowerCase().trim()
    const existing = bestPerGroup.get(key)
    if (!existing || score > existing.score) bestPerGroup.set(key, { row, score })
  }

  // Score first, then group name. Without the name tie-break the order fell out
  // of whatever order the rows arrived in, so the full PCS table and the
  // reduced offline copy listed the same groups differently — and the clinician
  // saw a different first suggestion depending on the network.
  return Array.from(bestPerGroup.values())
    .sort((a, b) => b.score - a.score || a.row.group.localeCompare(b.row.group))
    .map(({ row }) => row)
    .slice(0, limit)
}

export type CanonicalSearchTag = {
  code: string
  label: string
  sub?: string
  system?: string
  labelEn?: string
  labelBg?: string
  inn?: string
  atcCode?: string
  /**
   * Set only when the tag came from the offline bundled vocabulary rather than
   * a live search.
   *
   * Nothing on the write path validates a code against the server's table —
   * `PreopDiagnosis.code` is a plain string with no foreign key — so a code
   * from a stale bundle is stored silently rather than rejected. This is what
   * makes such a case findable afterwards. The API's item schema passes unknown
   * keys through, so it persists in `diagnosesJson` with no schema change.
   */
  vocabularyVersion?: string
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

export function parseClinicalSearchResult(
  kind: ClinicalSearchKind,
  value: unknown,
  locale: ClinicalSearchLocale = "en",
): CanonicalSearchTag | null {
  const item = record(value)
  if (!item) return null
  if (kind === "icd10") {
    const code = text(item.code)
    const description = text(item.description)
    if (!code || !description) return null
    const descriptionBg = text(item.descriptionBg)
    return {
      code,
      label: locale === "bg" && descriptionBg ? descriptionBg : description,
      sub: code,
      system: text(item.system) ?? "ICD-10",
      labelEn: description,
      ...(descriptionBg ? { labelBg: descriptionBg } : {}),
    }
  }
  if (kind === "procedure") {
    const code = text(item.code)
    const group = text(item.group)
    const description = text(item.description)
    const domain = text(item.domain)
    if (!code || (!group && !description)) return null
    return {
      code,
      label: group ?? description!,
      sub: domain ? `${code} \u00b7 ${domain}` : code,
      system: domain,
    }
  }
  const name = text(item.name)
  const inn = text(item.inn)
  if (!name && !inn) return null
  const strength = text(item.strength)
  const atcCode = text(item.atcCode) ?? text(item.atc)
  return {
    code: atcCode ?? inn ?? name!,
    label: inn ? `${inn}${strength ? ` ${strength}` : ""}` : name!,
    ...(name && name !== inn ? { sub: name } : {}),
    ...(inn ? { inn } : {}),
    ...(atcCode ? { atcCode } : {}),
  }
}

export function parseClinicalSearchResults(
  kind: ClinicalSearchKind,
  value: unknown,
  locale: ClinicalSearchLocale = "en",
): CanonicalSearchTag[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const parsed = parseClinicalSearchResult(kind, item, locale)
    return parsed ? [parsed] : []
  })
}
