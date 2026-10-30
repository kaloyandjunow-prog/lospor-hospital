import { createRequire } from "node:module"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

/**
 * Operating theatres for a spec (10.0.0): switched on, with two theatres of
 * its own placed first, and everything put back afterwards. Status is not part
 * of this harness, so the setup goes straight to the database, through the
 * API's own PostgreSQL client (the API owns the schema; see e2e-db.mjs).
 */
type PgClient = { connect(): Promise<void>; query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; end(): Promise<void> }

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://lospor:lospor-e2e@127.0.0.1:55433/lospor_e2e"

function client(): PgClient {
  const fromApi = createRequire(join(__dirname, "..", "..", "api", "package.json"))
  const { Client } = fromApi("pg") as { Client: new (options: { connectionString: string }) => PgClient }
  return new Client({ connectionString: databaseUrl })
}

export async function withTheatres(names?: [string, string]): Promise<{ theatres: { id: string; name: string }[]; restore: () => Promise<void> }> {
  const db = client()
  await db.connect()
  const suffix = randomUUID().slice(0, 8)
  const theatres = [
    { id: `e2e-theatre-1-${suffix}`, name: names?.[0] ?? `E2E Theatre 1 ${suffix}` },
    { id: `e2e-theatre-2-${suffix}`, name: names?.[1] ?? `E2E Theatre 2 ${suffix}` },
  ]
  try {
    const before = (await db.query(`SELECT enabled FROM "OperatingTheatrePolicy" WHERE id = 'local'`)).rows[0] as { enabled: boolean } | undefined
    await db.query(`INSERT INTO "OperatingTheatrePolicy" (id, enabled, "updatedAt") VALUES ('local', true, now())
      ON CONFLICT (id) DO UPDATE SET enabled = true, "updatedAt" = now()`)
    // Far ahead of any theatre already there, so the pickers offer these first.
    for (const [index, theatre] of theatres.entries()) {
      await db.query(`INSERT INTO "OperatingTheatre" (id, name, "sortOrder", active, "updatedAt") VALUES ($1, $2, $3, true, now())`, [theatre.id, theatre.name, -1000 + index])
    }
    return {
      theatres,
      restore: async () => {
        await db.query(`DELETE FROM "OperatingTheatre" WHERE id = ANY($1)`, [theatres.map(item => item.id)])
        if (before) await db.query(`UPDATE "OperatingTheatrePolicy" SET enabled = $1, "updatedAt" = now() WHERE id = 'local'`, [before.enabled])
        else await db.query(`DELETE FROM "OperatingTheatrePolicy" WHERE id = 'local'`)
        await db.end()
      },
    }
  } catch (error) {
    await db.end()
    throw error
  }
}

/** The institution a user belongs to, renamed for a while (the guide's screens); returns how to put the name back. */
export async function renameInstitutionOf(email: string, name: string): Promise<() => Promise<void>> {
  const db = client()
  await db.connect()
  const row = (await db.query(`SELECT i.id, i.name FROM "Institution" i JOIN "User" u ON u."institutionId" = i.id WHERE u.email = $1`, [email])).rows[0] as { id: string; name: string } | undefined
  if (!row) { await db.end(); return async () => {} }
  await db.query(`UPDATE "Institution" SET name = $1 WHERE id = $2`, [name, row.id])
  return async () => {
    await db.query(`UPDATE "Institution" SET name = $1 WHERE id = $2`, [row.name, row.id])
    await db.end()
  }
}

/** Every permission on a user's live research grants, for a while (the guide's screens); returns how to put them back. */
export async function widenResearchGrants(email: string): Promise<() => Promise<void>> {
  const db = client()
  await db.connect()
  const flags = `"canQuery", "canShareCohorts", "canInspectCases", "canExport", "canExportOmop"`
  const before = (await db.query(`SELECT g.id, ${flags} FROM "ResearchAccessGrant" g JOIN "User" u ON u.id = g."userId"
    WHERE u.email = $1 AND g."revokedAt" IS NULL AND g."expiresAt" > now()`, [email])).rows
  await db.query(`UPDATE "ResearchAccessGrant" SET "canQuery" = true, "canShareCohorts" = true, "canInspectCases" = true, "canExport" = true, "canExportOmop" = true, "updatedAt" = now()
    WHERE id = ANY($1)`, [before.map(row => row.id)])
  return async () => {
    for (const row of before) {
      await db.query(`UPDATE "ResearchAccessGrant" SET "canQuery" = $2, "canShareCohorts" = $3, "canInspectCases" = $4, "canExport" = $5, "canExportOmop" = $6 WHERE id = $1`,
        [row.id, row.canQuery, row.canShareCohorts, row.canInspectCases, row.canExport, row.canExportOmop])
    }
    await db.end()
  }
}
