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
   * A ceiling, not a target. The complete NHIS CL011 vocabulary deliberately
   * raises the old 3 MB ceiling: the same rows must support phone/PWA offline
   * search and seed an appliance database. Keep the 10 MB guard tight enough
   * that future growth is reviewed rather than silently absorbed.
   */
  it("stays within its size budget", () => {
    expect(sizeKb(icd10Rows())).toBeLessThan(10_240)
    expect(sizeKb(procedureRows())).toBeLessThan(512)
  })

  it("matches its declared counts", () => {
    expect(icd10Rows()).toHaveLength(ICD10_ROW_COUNT)
    expect(procedureRows()).toHaveLength(PROCEDURE_ROW_COUNT)
    expect(ICD10_ROW_COUNT).toBe(39_613)
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

  it("contains no known source-encoding damage", () => {
    const rows = icd10Rows()
    const damaged = rows.filter(row =>
      /[ÃÂ\uFFFD]/.test(`${row.labelEn}\n${row.labelBg ?? ""}`),
    )
    expect(damaged).toEqual([])

    const byCode = new Map(rows.map(row => [row.code, row]))
    expect(byCode.get("M35.0")?.labelBg).toBe("Синдром на Sjögren")
    expect(byCode.get("M35.2")?.labelBg).toBe("Синдром на Behçet")
    expect(byCode.get("M93.1")?.labelBg).toBe("Болест на Kienböck при възрастни")
    expect(byCode.get("S06.51")?.labelEn).toBe("Traumatic subdural hemorrhage, with open intracranial trauma")
    expect(byCode.get("S06.51")?.labelBg).toBe("Травматичен субдурален кръвоизлив, с открита вътречерепна травма")
  })

  it("finds real diagnoses in both languages", () => {
    expect(searchIcd10(icd10Rows(), "I21", "en").length).toBeGreaterThan(0)
    expect(searchIcd10(icd10Rows(), "diabetes", "en").length).toBeGreaterThan(0)
    expect(searchIcd10(icd10Rows(), "диабет", "bg").length).toBeGreaterThan(0)
  })

  it("finds a procedure group by its Bulgarian name", () => {
    // Words from the Bulgarian procedure classification (КСМП) names that
    // crosswalk to each group, so an operation can be searched in Bulgarian.
    expect(searchProcedures(procedureRows(), "холецистектомия").map(r => r.group)).toContain("Cholecystectomy")
    expect(searchProcedures(procedureRows(), "апендектомия").map(r => r.group)).toContain("Appendectomy")
    expect(searchProcedures(procedureRows(), "цезарово").map(r => r.group)).toContain("Cesarean section")
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

describe("offline exact operations", () => {
  it("hold every operation of a group, the same list the online endpoint gives", async () => {
    const { procedureCodeRowsForGroup, PROCEDURE_CODE_COUNT } = await import("./procedure-codes")
    const { filterProcedureCodes } = await import("../procedure-codes")
    expect(PROCEDURE_CODE_COUNT).toBeGreaterThan(80_000)

    const rows = procedureCodeRowsForGroup("cholecystectomy")
    expect(rows).toHaveLength(8)
    expect(rows).toContainEqual({
      code: "0FT44ZZ", group: "Cholecystectomy", domain: "Hepatobiliary and Pancreas Procedures",
      description: "Resection of Gallbladder, Percutaneous Endoscopic Approach",
    })
    expect(filterProcedureCodes(rows, "Cholecystectomy", "лапароскопска resection").map(row => row.code))
      .toEqual(["0FT44ZG", "0FT44ZZ"])
    expect(procedureCodeRowsForGroup("Not a group")).toEqual([])
  })

  it("stays off the group search module, which loads with every offline search", async () => {
    const index = await import("./index")
    expect(Object.keys(index)).not.toContain("procedureCodeRowsForGroup")
  })
})
