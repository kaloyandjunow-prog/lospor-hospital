import * as archiverModule from "archiver"
import { createWriteStream } from "node:fs"
import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { finished } from "node:stream/promises"
import {
  OMOP_TABLES,
  type OmopTableName,
  type TableManifest,
} from "@lospor/exchange-contract"
import type { OmopBundle } from "@/lib/omop-mapper"
import { sha256, sha256File } from "./hash"
import { omopTableCsv } from "./omop-csv"

const createArchive = archiverModule as unknown as (
  format: "zip",
  options: { zlib: { level: number } },
) => archiverModule.Archiver

const bundleTable = (
  bundle: OmopBundle,
  table: OmopTableName,
): readonly Record<string, unknown>[] =>
  (bundle as unknown as Record<OmopTableName, readonly Record<string, unknown>[]>)[table]

export async function createOmopArchive(
  bundle: OmopBundle,
  archivePath: string,
): Promise<{
  tables: TableManifest[]
  payloadSha256: string
  payloadByteSize: number
}> {
  await mkdir(dirname(archivePath), { recursive: true })
  const output = createWriteStream(archivePath, { flags: "wx", mode: 0o600 })
  const archive = createArchive("zip", { zlib: { level: 9 } })
  archive.pipe(output)

  const tables: TableManifest[] = []
  for (const table of OMOP_TABLES) {
    const rows = bundleTable(bundle, table)
    const filename = `${table}.csv`
    const csv = omopTableCsv(table, rows)
    tables.push({
      table,
      filename,
      rowCount: rows.length,
      byteSize: csv.byteLength,
      sha256: sha256(csv),
    })
    archive.append(csv, { name: filename })
  }

  await archive.finalize()
  await finished(output)
  const payload = await sha256File(archivePath)
  return {
    tables,
    payloadSha256: payload.sha256,
    payloadByteSize: payload.byteSize,
  }
}

