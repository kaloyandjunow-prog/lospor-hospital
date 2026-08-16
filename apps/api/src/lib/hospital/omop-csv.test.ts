import { describe, expect, it } from "vitest"

import { mapCasesToOmop } from "@/lib/omop-mapper"
import { completeCaseFixture } from "@/__tests__/fixtures/complete-case"
import { omopTableCsv } from "./omop-csv"
import type { OmopTableName } from "@lospor/exchange-contract"

/**
 * The Central export writes CSV from a hand-maintained column list, one per
 * table, exactly like the research export does — and it drifted the same way.
 *
 * lib/research/omop-csv-columns.test.ts was written after OBSERVATION gained
 * `value_as_number` and the research column list did not, silently dropping
 * every clinical score on the way to the file. That guard was never extended to
 * this serializer, so the identical omission survived here: Aldrete and its
 * subscores, RCRI, Apfel, STOP-BANG, POVOC, COLDS, PAED, pain scores, age, BSA,
 * duration and fluid totals all reached Central without their numbers. Nothing
 * failed. Row counts were right, the header parsed, the suite was green.
 *
 * This reads the CSV text rather than the declaration, and covers every table
 * rather than the one known to have broken.
 */

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ""
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    if (quoted) {
      if (character === "\"" && line[index + 1] === "\"") {
        cell += "\""
        index++
      } else if (character === "\"") {
        quoted = false
      } else {
        cell += character
      }
    } else if (character === "\"") {
      quoted = true
    } else if (character === ",") {
      cells.push(cell)
      cell = ""
    } else {
      cell += character
    }
  }
  cells.push(cell)
  return cells
}

const bundle = mapCasesToOmop([completeCaseFixture() as never], {
  userId: "admin-1",
  userRole: "ADMIN",
  statusFilter: ["COMPLETE"],
  excludedCaseCount: 0,
  gitCommit: "test",
  forcedOverride: false,
} as never)

const OMOP_TABLES: OmopTableName[] = [
  "person",
  "observation_period",
  "visit_occurrence",
  "condition_occurrence",
  "drug_exposure",
  "measurement",
  "procedure_occurrence",
  "observation",
]

describe("Central OMOP CSV columns", () => {
  it.each(OMOP_TABLES)("writes every field the mapper emits for %s", table => {
    const rows = bundle[table] as unknown as Record<string, unknown>[]
    expect(rows.length).toBeGreaterThan(0)
    const emitted = [...new Set(rows.flatMap(row => Object.keys(row)))].sort()
    const header = parseCsvLine(omopTableCsv(table, rows).toString("utf8").split("\n")[0])
    expect([...header].sort()).toEqual(emitted)
  })

  it("keeps every value row the same width as the header", () => {
    for (const table of OMOP_TABLES) {
      const rows = bundle[table] as unknown as Record<string, unknown>[]
      const lines = omopTableCsv(table, rows).toString("utf8").trimEnd().split("\n")
      const header = parseCsvLine(lines[0])
      for (const line of lines.slice(1)) {
        expect(parseCsvLine(line)).toHaveLength(header.length)
      }
    }
  })

  it("carries the numeric value of a clinical score, not just its text", () => {
    // The specific loss this guard exists for. A score that arrives as text
    // only cannot be aggregated, which is the entire reason to collect it.
    const rows = bundle.observation as unknown as Record<string, unknown>[]
    const numeric = rows.find(row => row.value_as_number != null)
    expect(numeric, "fixture must contain at least one numeric observation").toBeDefined()

    const csv = omopTableCsv("observation", [numeric!]).toString("utf8").trimEnd().split("\n")
    const header = parseCsvLine(csv[0])
    const values = parseCsvLine(csv[1])
    const index = header.indexOf("value_as_number")
    expect(index, "value_as_number must be a column in the Central export").toBeGreaterThanOrEqual(0)
    expect(values[index]).toBe(String(numeric!.value_as_number))
  })
})
