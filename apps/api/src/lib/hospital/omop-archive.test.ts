import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { strFromU8, unzipSync } from "fflate"
import { afterEach, describe, expect, it } from "vitest"
import { OMOP_TABLES, type OmopTableName } from "@lospor/exchange-contract"
import type { OmopBundle } from "@/lib/omop-mapper"
import { createOmopArchive } from "./omop-archive"
import { omopTableCsv } from "./omop-csv"

const temporaryDirectories: string[] = []

async function temporaryArchivePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "lospor-omop-archive-"))
  temporaryDirectories.push(directory)
  return join(directory, "payload.zip")
}

function fixtureBundle(): OmopBundle {
  const tables = Object.fromEntries(OMOP_TABLES.map(table => [table, []])) as unknown as Record<
    OmopTableName,
    Record<string, unknown>[]
  >
  tables.person.push({
    person_id: "person-1",
    gender_concept_id: 8507,
    year_of_birth: 1979,
    person_source_value: "site-person-1",
    gender_source_value: "MALE",
  })
  tables.observation.push({
    observation_id: "observation-1",
    person_id: "person-1",
    observation_concept_id: 0,
    observation_date: "2026-08-13",
    observation_type_concept_id: 32817,
    value_as_string: "quoted \"value\", line\nbreak",
    observation_source_value: "test-observation",
    visit_occurrence_id: "visit-1",
  })
  return { ...tables, metadata: {} } as unknown as OmopBundle
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true }),
  ))
})

describe("createOmopArchive", () => {
  it("writes the eight real OMOP CSV files and truthful manifests", async () => {
    const archivePath = await temporaryArchivePath()
    const bundle = fixtureBundle()

    const result = await createOmopArchive(bundle, archivePath)
    const payload = await readFile(archivePath)
    const entries = unzipSync(payload)

    expect(Object.keys(entries).sort()).toEqual(
      OMOP_TABLES.map(table => `${table}.csv`).sort(),
    )
    expect(result.payloadByteSize).toBe(payload.byteLength)
    expect(result.payloadSha256).toBe(createHash("sha256").update(payload).digest("hex"))

    for (const table of OMOP_TABLES) {
      const rows = (bundle as unknown as Record<OmopTableName, Record<string, unknown>[]>)[table]
      const expectedCsv = omopTableCsv(table, rows)
      const actualCsv = Buffer.from(entries[`${table}.csv`])
      const manifest = result.tables.find(item => item.table === table)

      expect(actualCsv).toEqual(expectedCsv)
      expect(manifest).toEqual({
        table,
        filename: `${table}.csv`,
        rowCount: rows.length,
        byteSize: expectedCsv.byteLength,
        sha256: createHash("sha256").update(expectedCsv).digest("hex"),
      })
    }

    expect(strFromU8(entries["observation.csv"]))
      .toContain('"quoted ""value"", line\nbreak"')
  })

  it("refuses to overwrite an existing export artifact", async () => {
    const archivePath = await temporaryArchivePath()
    const existing = Buffer.from("existing export must survive")
    await writeFile(archivePath, existing)

    await expect(createOmopArchive(fixtureBundle(), archivePath))
      .rejects.toMatchObject({ code: "EEXIST" })
    await expect(readFile(archivePath)).resolves.toEqual(existing)
  })
})
