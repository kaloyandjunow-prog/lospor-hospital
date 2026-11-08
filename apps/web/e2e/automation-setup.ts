import { createRequire } from "node:module"
import { join } from "node:path"

/**
 * Intraoperative automation for a spec (10.1.0): switched on as Status would,
 * and put back afterwards. Status is not part of this harness, so the setting
 * goes straight to the database through the API's own PostgreSQL client, as
 * theatres-setup.ts does.
 */
type PgClient = { connect(): Promise<void>; query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; end(): Promise<void> }

const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://lospor:lospor-e2e@127.0.0.1:55433/lospor_e2e"

function client(): PgClient {
  const fromApi = createRequire(join(__dirname, "..", "..", "lospor-api", "package.json"))
  const { Client } = fromApi("pg") as { Client: new (options: { connectionString: string }) => PgClient }
  return new Client({ connectionString: databaseUrl })
}

export async function withIntraopAutomation(config: unknown): Promise<{ restore: () => Promise<void> }> {
  const db = client()
  await db.connect()
  const before = (await db.query(`SELECT config FROM "IntraopAutomationPolicy" WHERE id = 'local'`)).rows[0]?.config
  await db.query(`INSERT INTO "IntraopAutomationPolicy" (id, config, "updatedAt") VALUES ('local', $1, now())
    ON CONFLICT (id) DO UPDATE SET config = $1, "updatedAt" = now()`, [JSON.stringify(config)])
  return {
    restore: async () => {
      if (before === undefined) await db.query(`DELETE FROM "IntraopAutomationPolicy" WHERE id = 'local'`)
      else await db.query(`UPDATE "IntraopAutomationPolicy" SET config = $1 WHERE id = 'local'`, [JSON.stringify(before)])
      await db.end()
    },
  }
}
