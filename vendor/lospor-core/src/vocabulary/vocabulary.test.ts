import { describe, expect, it } from "vitest"
import { icd10Rows, ICD10_ROW_COUNT, procedureRows, PROCEDURE_ROW_COUNT, VOCABULARY_VERSION } from "./index"
import { searchIcd10, searchProcedures } from "../search"

/**
 * Measured from the data itself rather than the file on disk: core is
 * deliberately framework-free and has no Node types, and the payload size is
 * the thing that actually matters on the phone.
 */
function sizeKb(value: unknown): number {
  return JSON.stringify(value).length / 1024
}

describe("offline vocabulary", () => {
  /**
   * A ceiling, not a target. This data ships inside the APK and is parsed by
   * Hermes on the phone; it must not creep up unnoticed.
   */
  it("stays within its size budget", () => {
    expect(sizeKb(icd10Rows())).toBeLessThan(3_072)
    expect(sizeKb(procedureRows())).toBeLessThan(512)
  })

  it("matches its declared counts", () => {
    expect(icd10Rows()).toHaveLength(ICD10_ROW_COUNT)
    expect(procedureRows()).toHaveLength(PROCEDURE_ROW_COUNT)
    expect(ICD10_ROW_COUNT).toBeGreaterThan(15_000)
    expect(PROCEDURE_ROW_COUNT).toBeGreaterThan(300)
  })

  /**
   * Parity with the API depends on this: the endpoint applies its per-group
   * caps after `orderBy: { code: "asc" }`, so the bundle must be in the same
   * order or the two select different rows for the same query.
   */
  it("is ordered by code, as the API's queries are", () => {
    const codes = icd10Rows().map(row => row.code)
    expect([...codes].sort((a, b) => a.localeCompare(b))).toEqual(codes)
  })

  it("expands once and reuses the result", () => {
    expect(icd10Rows()).toBe(icd10Rows())
    expect(procedureRows()).toBe(procedureRows())
  })

  it("carries Bulgarian labels for the great majority of codes", () => {
    const withBg = icd10Rows().filter(row => row.labelBg).length
    expect(withBg / ICD10_ROW_COUNT).toBeGreaterThan(0.9)
  })

  it("finds real diagnoses in both languages", () => {
    expect(searchIcd10(icd10Rows(), "I21", "en").length).toBeGreaterThan(0)
    expect(searchIcd10(icd10Rows(), "diabetes", "en").length).toBeGreaterThan(0)
    expect(searchIcd10(icd10Rows(), "диабет", "bg").length).toBeGreaterThan(0)
  })

  it("finds a group through a sibling code's wording, not just its own name", () => {
    // "resection" does not appear in "Gastrectomy"; it appears in the
    // descriptions of codes within that group. This is what `terms` restores.
    const groups = searchProcedures(procedureRows(), "resection").map(r => r.group)
    expect(groups).toContain("Gastrectomy")
    expect(groups.length).toBeGreaterThan(20)
  })

  it("declares a version, so a coded case can be traced to its copy", () => {
    expect(VOCABULARY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
