/**
 * Chain check, appliance half.
 *
 * Pins what this appliance puts on the wire, and regenerates the fixture
 * Central ingests in its own half of the check
 * (lospor-central apps/server/src/lib/__fixtures__/appliance-observations.json).
 *
 * Run with CHAIN_OUT set to rewrite that fixture after any change to the mapper
 * or the CSV writer:
 *
 *   CHAIN_OUT=<path> npx vitest run src/__tests__/chain-export.generate.test.ts
 *
 * It uses the real mapper and the real CSV writer, then parses the line back
 * the way Central's staging does, so what the fixture holds is what the
 * appliance emits rather than the in-memory objects it built. A fixture written
 * by hand would agree with Central by construction and prove nothing.
 */
import { writeFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"

// exports.ts reaches Prisma, which is marked server-only; the serialisation
// used here does not touch either. Same neutralisation the vendored
// omop-csv-columns test uses, so this stays on the real writer.
vi.mock("server-only", () => ({}))

import { mapCasesToOmop } from "@/lib/omop-mapper"
import { omopCsvColumns, omopCsvHeaderLine, omopCsvValueLine } from "@/lib/research/exports"
import { DICTIONARY_VERSION } from "@/lib/data-dictionary"

import { completeCaseFixture } from "./fixtures/complete-case"

const OUT = process.env.CHAIN_OUT

describe("chain export artefact", () => {
  it("emits observation rows the way a real export does", () => {
    const bundle = mapCasesToOmop([completeCaseFixture() as never], {
      userId: "chain-check",
      userRole: "ADMIN",
      statusFilter: ["COMPLETE"],
      excludedCaseCount: 0,
      gitCommit: "chain-check",
      forcedOverride: false,
    })

    const columns = omopCsvColumns("observation")
    const header = omopCsvHeaderLine("observation")
    // Both writers terminate the line; staging strips that before splitting, so
    // trim first or the last column's name carries a newline and its value is
    // never found again.
    const headerFields = header.trimEnd().split(",").map(field => field.replace(/^"|"$/g, ""))

    const rows = bundle.observation.map(observation => {
      const values = omopCsvValueLine("observation", observation as never).trimEnd().split(",")
      const row: Record<string, string> = {}
      headerFields.forEach((field, index) => {
        row[field] = (values[index] ?? "").replace(/^"|"$/g, "")
      })
      return row
    })

    // Guard the harness itself: a stray newline in a key silently drops a column.
    expect(Object.keys(rows[0] ?? {})).toEqual([...columns])

    const numeric = rows.filter(row => row.value_as_number !== "")

    // The chain is only meaningful if the appliance really does emit numbers.
    expect(columns).toContain("value_as_number")
    expect(numeric.length).toBeGreaterThan(0)

    console.log(`[chain] columns        : ${columns.join(", ")}`)
    console.log(`[chain] rows           : ${rows.length}`)
    console.log(`[chain] numeric rows   : ${numeric.length}`)
    console.log(`[chain] dictionary     : ${bundle.metadata.data_dictionary_version}`)
    console.log(`[chain] source_version : ${bundle.metadata.source_version}`)
    for (const row of numeric.slice(0, 6)) {
      console.log(`[chain]   ${row.observation_source_value} = ${row.value_as_number}`)
    }

    if (OUT) {
      writeFileSync(OUT, JSON.stringify({
        dictionaryVersion: DICTIONARY_VERSION,
        bundleDictionaryVersion: bundle.metadata.data_dictionary_version,
        sourceVersion: bundle.metadata.source_version,
        columns,
        rowCount: rows.length,
        numericCount: numeric.length,
        rows,
      }, null, 2))
      console.log(`[chain] wrote ${OUT}`)
    }
  })
})
