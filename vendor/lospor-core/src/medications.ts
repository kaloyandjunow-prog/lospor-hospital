/**
 * The medication list a clinician picks home medications and allergies from,
 * and the one search over it.
 *
 * The rows are generated (./vocabulary/medications, from the national NHIS
 * register CL009 plus the products it lacks from LOSPOR's earlier list). The
 * search is here, not in the API or the apps, so the server, the phone offline
 * and Status answer the same query with the same products in the same order.
 */

export type MedicationRow = {
  /** Stable across releases: `cl009:<national product code>` or `bda:<hash>`. */
  id: string
  name: string
  /** International non-proprietary name, as the source writes it. */
  inn: string
  /** WHO ATC code, validated against WHO ATC; empty when the source has none. */
  atc: string
  form: string
  strength: string
  /** The national product code (CL009 key) a hospital system sends, if any. */
  nhisCode: string | null
}

const fold = (value: string) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** One entry per product as a clinician sees it: CL009 lists every pack size. */
function productKey(row: MedicationRow): string {
  return [row.name, row.inn, row.form, row.strength, row.atc].map(fold).join("|")
}

/**
 * Products whose name, INN or ATC code match `query`, best first.
 *
 * Ranking is the one the server has always used -- a name or INN that starts
 * with the query before one that only contains it -- with an ATC code query
 * ("C09AA05", "C09AA") answered by prefix. Pack sizes of one product collapse to
 * their first row.
 */
export function searchMedications(rows: readonly MedicationRow[], query: string, limit = 10): MedicationRow[] {
  const q = fold(query.trim())
  if (!q) return []
  const atcQuery = /^[a-z]\d{2}([a-z]{1,2}(\d{1,2})?)?$/.test(q) ? q.toUpperCase() : null
  const seen = new Set<string>()
  const scored: { row: MedicationRow; score: number; order: number }[] = []
  rows.forEach((row, order) => {
    const name = fold(row.name)
    const inn = fold(row.inn)
    const nameMatch = name.includes(q)
    const innMatch = inn.includes(q)
    const atcMatch = atcQuery !== null && row.atc.startsWith(atcQuery)
    if (!nameMatch && !innMatch && !atcMatch) return
    const key = productKey(row)
    if (seen.has(key)) return
    seen.add(key)
    const score = atcMatch && !nameMatch && !innMatch
      ? 1
      : (name.startsWith(q) ? 0 : nameMatch ? 1 : 2) + (inn.startsWith(q) ? 0 : innMatch ? 1 : 2)
    scored.push({ row, score, order })
  })
  scored.sort((a, b) => a.score - b.score || a.order - b.order)
  return scored.slice(0, limit).map(entry => entry.row)
}

/** Every product with this ATC code, one per product, in list order. */
export function medicationsWithAtc(rows: readonly MedicationRow[], atc: string, limit = 50): MedicationRow[] {
  const code = atc.trim().toUpperCase().replace(/\s+/g, "")
  if (!code) return []
  const seen = new Set<string>()
  const found: MedicationRow[] = []
  for (const row of rows) {
    if (row.atc !== code) continue
    const key = productKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    found.push(row)
    if (found.length >= limit) break
  }
  return found
}

/** The product a national product code (CL009 key) names, if the list has it. */
export function medicationByNhisCode(rows: readonly MedicationRow[], code: string): MedicationRow | undefined {
  const key = code.trim()
  return key ? rows.find(row => row.nhisCode === key) : undefined
}

export function medicationById(rows: readonly MedicationRow[], id: string): MedicationRow | undefined {
  return rows.find(row => row.id === id)
}
