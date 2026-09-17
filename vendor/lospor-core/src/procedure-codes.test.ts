import { describe, expect, it } from "vitest"

import {
  exactProcedureTag,
  filterProcedureCodes,
  ICD10PCS_SYSTEM,
  isExactProcedure,
  isIcd10PcsCode,
  procedureGroupOf,
  procedureGroupTag,
  PROCEDURE_GROUP_SYSTEM,
} from "./procedure-codes"
import { parseClinicalSearchResult, searchProcedures, type ProcedureSearchRow } from "./search"

const DOMAIN = "Hepatobiliary System and Pancreas"
const row = (code: string, description: string, group = "Cholecystectomy"): ProcedureSearchRow =>
  ({ code, description, group, domain: DOMAIN })

const ROWS = [
  row("0FB40ZZ", "Excision of Gallbladder, Open Approach"),
  row("0FB44ZZ", "Excision of Gallbladder, Percutaneous Endoscopic Approach"),
  row("0FJ44ZZ", "Inspection of Gallbladder, Percutaneous Endoscopic Approach"),
  row("0FT40ZZ", "Resection of Gallbladder, Open Approach"),
  row("0FT44ZZ", "Resection of Gallbladder, Percutaneous Endoscopic Approach"),
  row("0FT44ZG", "Resection of gallbladder, percutaneous endoscopic approach, hand-assisted"),
  row("0DTJ4ZZ", "Resection of Appendix, Percutaneous Endoscopic Approach", "Appendectomy"),
]

describe("a procedure chosen from the search", () => {
  it("is the group, not the example code the search matched", () => {
    const [best] = searchProcedures(ROWS, "cholecystectomy")
    expect(best.code).toBe("0FB40ZZ")
    const tag = parseClinicalSearchResult("procedure", best)
    expect(tag).toEqual({
      label: "Cholecystectomy", code: "Cholecystectomy", system: PROCEDURE_GROUP_SYSTEM,
      group: "Cholecystectomy", domain: DOMAIN, sub: DOMAIN,
    })
    expect(isExactProcedure(tag)).toBe(false)
  })
})

describe("the exact operation", () => {
  it("keeps the group as its label and carries the ICD-10-PCS code", () => {
    const tag = exactProcedureTag(ROWS[4])
    expect(tag).toEqual({
      label: "Cholecystectomy", code: "0FT44ZZ", system: ICD10PCS_SYSTEM, group: "Cholecystectomy",
      domain: DOMAIN, description: "Resection of Gallbladder, Percutaneous Endoscopic Approach",
      sub: "0FT44ZZ · Resection of Gallbladder, Percutaneous Endoscopic Approach",
    })
    expect(isExactProcedure(tag)).toBe(true)
  })

  it("is only a real ICD-10-PCS code under the ICD-10-PCS system", () => {
    expect(isIcd10PcsCode("0FT44ZZ")).toBe(true)
    expect(isIcd10PcsCode("0FT44ZO")).toBe(false)
    expect(isIcd10PcsCode("30445-00")).toBe(false)
    expect(isExactProcedure({ system: "Hepatobiliary System and Pancreas", code: "0FB40ZZ" })).toBe(false)
  })

  it("is listed from its group and narrowed by every word typed", () => {
    expect(filterProcedureCodes(ROWS, "Cholecystectomy").map(r => r.code))
      .toEqual(["0FB40ZZ", "0FB44ZZ", "0FJ44ZZ", "0FT40ZZ", "0FT44ZG", "0FT44ZZ"])
    expect(filterProcedureCodes(ROWS, "cholecystectomy", "lap resection").map(r => r.code))
      .toEqual(["0FT44ZG", "0FT44ZZ"])
    expect(filterProcedureCodes(ROWS, "Cholecystectomy", "лапароскопска").map(r => r.code))
      .toEqual(["0FB44ZZ", "0FJ44ZZ", "0FT44ZG", "0FT44ZZ"])
    expect(filterProcedureCodes(ROWS, "Cholecystectomy", "0FT4").map(r => r.code)).toEqual(["0FT40ZZ", "0FT44ZG", "0FT44ZZ"])
  })
})

describe("the group of a stored procedure", () => {
  it("reads the explicit group, or the label every earlier tag kept it in", () => {
    expect(procedureGroupOf(procedureGroupTag(ROWS[0]))).toBe("Cholecystectomy")
    expect(procedureGroupOf({ label: "Cholecystectomy", sub: "0FB40ZZ · Hepatobiliary System and Pancreas" })).toBe("Cholecystectomy")
    expect(procedureGroupOf({ label: " " })).toBeNull()
  })
})

describe("the planned-procedure line on the record and the printed sheet", () => {
  it("shows the exact operation with its code, and anything else as its label", async () => {
    const { plannedProcedureText, procedureDisplayText } = await import("./procedure-codes")
    const exact = exactProcedureTag(ROWS[4])
    expect(procedureDisplayText(exact)).toBe("Cholecystectomy: Resection of Gallbladder, Percutaneous Endoscopic Approach [0FT44ZZ]")
    expect(plannedProcedureText([exact, procedureGroupTag(ROWS[6]), { label: "Free text" }, null]))
      .toBe("Cholecystectomy: Resection of Gallbladder, Percutaneous Endoscopic Approach [0FT44ZZ]; Appendectomy; Free text")
  })

  it("is what the saved case payload carries", async () => {
    const { buildCanonicalPreopPayload } = await import("./preop-payload")
    const payload = buildCanonicalPreopPayload({ procedures: [exactProcedureTag(ROWS[3])] } as Parameters<typeof buildCanonicalPreopPayload>[0])
    expect(payload.plannedProcedure).toBe("Cholecystectomy: Resection of Gallbladder, Open Approach [0FT40ZZ]")
  })
})

describe("an imported procedure refined to its exact operation", () => {
  const imported = {
    label: "Cholecystectomy", group: "Cholecystectomy", code: "30445-00", system: "urn:bg:ksmp",
    sourceVocabulary: "KSMP", sourceLabel: "Лапароскопска холецистектомия",
    suggestedCodes: ["0FB44ZZ", "0FT44ZZ"], source: "import",
  }

  it("offers the operations the hospital code crosswalked to first", async () => {
    const { filterProcedureCodes, suggestedProcedureCodes } = await import("./procedure-codes")
    expect(filterProcedureCodes(ROWS, "Cholecystectomy", "", suggestedProcedureCodes(imported)).map(row => [row.code, row.suggested ?? false]))
      .toEqual([["0FB44ZZ", true], ["0FT44ZZ", true], ["0FB40ZZ", false], ["0FJ44ZZ", false], ["0FT40ZZ", false], ["0FT44ZG", false]])
  })

  it("keeps the hospital's code and wording, and gives them back when undone", async () => {
    const { backToProcedureGroup, chooseExactOperation } = await import("./procedure-codes")
    const exact = chooseExactOperation(imported, ROWS[4])
    expect(exact).toMatchObject({
      code: "0FT44ZZ", system: ICD10PCS_SYSTEM, source: "import",
      imported: { code: "30445-00", system: "urn:bg:ksmp", sourceVocabulary: "KSMP", sourceLabel: "Лапароскопска холецистектомия", suggestedCodes: ["0FB44ZZ", "0FT44ZZ"] },
    })
    expect(backToProcedureGroup(exact)).toEqual({ ...imported, domain: DOMAIN })
  })

  it("leaves a procedure the clinician picked as a plain group when undone", async () => {
    const { backToProcedureGroup, chooseExactOperation } = await import("./procedure-codes")
    const manual = { ...procedureGroupTag(ROWS[0]), source: "manual" }
    const exact = chooseExactOperation(manual, ROWS[4])
    expect(exact).not.toHaveProperty("imported")
    expect(backToProcedureGroup(exact)).toEqual(manual)
  })
})
