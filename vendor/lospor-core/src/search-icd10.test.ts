import { describe, expect, it } from "vitest"
import {
  ICD10_CODE_CONFIDENCE,
  ICD10_CODE_TAKE,
  ICD10_LABEL_TAKE,
  isIcd10CodeLikeQuery,
  mergeIcd10Results,
  searchIcd10,
  selectIcd10Candidates,
  type Icd10SearchRow,
} from "./search"

/**
 * A stand-in for the vocabulary, ordered by code as both the database (with its
 * explicit `orderBy`) and the bundled copy are.
 */
const ROWS: Icd10SearchRow[] = [
  { code: "E11", labelEn: "Type 2 diabetes mellitus", labelBg: "Захарен диабет тип 2" },
  { code: "I10", labelEn: "Essential hypertension", labelBg: "Есенциална хипертония" },
  { code: "I20", labelEn: "Angina pectoris", labelBg: "Ангина пекторис" },
  { code: "I21", labelEn: "Acute myocardial infarction", labelBg: "Остър миокарден инфаркт" },
  { code: "I22", labelEn: "Subsequent myocardial infarction", labelBg: null },
  { code: "J44", labelEn: "Chronic obstructive pulmonary disease", labelBg: "ХОББ" },
  { code: "J45", labelEn: "Asthma", labelBg: "Астма" },
]

/**
 * The API route's plan, re-implemented here over the same rows using array
 * operations that mirror its Prisma filters. If the shared selector ever
 * diverges from what the route would ask the database for, this fails.
 */
function routePlan(rows: Icd10SearchRow[], q: string, useBg: boolean): Icd10SearchRow[][] {
  const term = q.trim().toLowerCase()
  const byCode = rows
    .filter(r => r.code.startsWith(q.trim().toUpperCase()))
    .sort((a, b) => a.code.localeCompare(b.code))
    .slice(0, ICD10_CODE_TAKE)

  if (isIcd10CodeLikeQuery(q) || byCode.length >= ICD10_CODE_CONFIDENCE) return [byCode]

  const matches = (label: string | null | undefined) => {
    if (!label) return false
    const value = label.toLowerCase()
    return q.trim().length < 4 ? value.startsWith(term) : value.includes(term)
  }
  const byBgLabel = useBg
    ? rows.filter(r => matches(r.labelBg)).sort((a, b) => a.code.localeCompare(b.code)).slice(0, ICD10_LABEL_TAKE)
    : []
  const byEnLabel = rows
    .filter(r => matches(r.labelEn))
    .sort((a, b) => a.code.localeCompare(b.code))
    .slice(0, ICD10_LABEL_TAKE)
  return [byBgLabel, byCode, byEnLabel]
}

const QUERIES = [
  "I2", "I21", "i21", "J4", "diab", "diabetes", "hyper", "asthma",
  "Астма", "инфаркт", "ХОББ", "zzz", "E1", "myocardial",
]

describe("ICD-10 search parity", () => {
  it("selects what the API route's query plan would select", () => {
    for (const locale of ["en", "bg"] as const) {
      for (const query of QUERIES) {
        expect(
          selectIcd10Candidates(ROWS, query, locale),
          `query "${query}" (${locale})`,
        ).toEqual(routePlan(ROWS, query, locale === "bg"))
      }
    }
  })

  it("produces the same final payload through both entry points", () => {
    for (const locale of ["en", "bg"] as const) {
      for (const query of QUERIES) {
        const viaRoute = mergeIcd10Results(routePlan(ROWS, query, locale === "bg"), locale === "bg")
        expect(searchIcd10(ROWS, query, locale), `query "${query}" (${locale})`).toEqual(viaRoute)
      }
    }
  })

  it("is not vacuous — the corpus produces real hits", () => {
    const hits = QUERIES.map(q => searchIcd10(ROWS, q, "bg").length)
    expect(hits.filter(n => n > 0).length).toBeGreaterThanOrEqual(QUERIES.length - 2)
  })

  it("treats a code-like query as a code lookup and skips label groups", () => {
    const groups = selectIcd10Candidates(ROWS, "I21", "bg")
    expect(groups).toHaveLength(1)
    expect(groups[0]?.map(r => r.code)).toEqual(["I21"])
  })

  it("prefers the Bulgarian label when the locale is bg", () => {
    const [first] = searchIcd10(ROWS, "I21", "bg")
    expect(first?.display).toBe("I21 - Остър миокарден инфаркт")
    const [english] = searchIcd10(ROWS, "I21", "en")
    expect(english?.display).toBe("I21 - Acute myocardial infarction")
  })

  it("falls back to the English label when no Bulgarian one exists", () => {
    const [only] = searchIcd10(ROWS, "I22", "bg")
    expect(only?.display).toBe("I22 - Subsequent myocardial infarction")
    expect(only?.descriptionBg).toBeUndefined()
  })

  it("returns nothing below the minimum query length", () => {
    expect(searchIcd10(ROWS, "I", "en")).toEqual([])
  })

  it("never repeats a code across groups", () => {
    const codes = searchIcd10(ROWS, "diabetes", "bg").map(r => r.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})
