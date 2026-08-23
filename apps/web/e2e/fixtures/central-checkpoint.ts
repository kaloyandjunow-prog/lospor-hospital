import { createRequire } from "node:module"
import { join } from "node:path"

type PgClient = {
  connect(): Promise<void>
  end(): Promise<void>
  query(text: string, values?: unknown[]): Promise<{ rowCount: number | null }>
}

type PgClientConstructor = new (input: { connectionString: string }) => PgClient

const apiRequire = createRequire(join(__dirname, "..", "..", "..", "api", "package.json"))
const { Client } = apiRequire("pg") as { Client: PgClientConstructor }

const DEFAULT_E2E_DATABASE_URL =
  "postgresql://lospor:lospor-e2e@127.0.0.1:55433/lospor_e2e"

/**
 * Advances only the disposable E2E case's signed-receipt checkpoint.
 *
 * The cryptographic worker story is covered by the separate synthetic-Central
 * PostgreSQL gate. This browser fixture starts after that boundary so the Web
 * test can prove that an immutable creator keeps only withdraw/resend authority
 * after clinical ownership has moved, without adding a production test route.
 */
export async function acceptCentralAction(
  caseId: string,
  action: "UPSERT" | "WITHDRAW",
): Promise<void> {
  const client = new Client({
    connectionString: process.env.E2E_DATABASE_URL ?? DEFAULT_E2E_DATABASE_URL,
  })
  await client.connect()
  try {
    const acceptedAt = new Date()
    const checkpoint = await client.query(`
      INSERT INTO "CentralExportCheckpoint" (
        "caseId", "lastBatchId", "lastAction", "clinicalRevision",
        "eventRevision", "relationalRevision", "preopRevision",
        "intraopRevision", "postopRevision", "acceptedAt", "updatedAt"
      )
      SELECT c.id, $2, $3, c."clinicalRevision", c."eventRevision",
             c."relationalRevision", preop."syncRevision",
             intraop."syncRevision", postop."syncRevision", $4, $4
      FROM "Case" c
      LEFT JOIN "PreoperativeAssessment" preop ON preop."caseId" = c.id
      LEFT JOIN "IntraoperativeRecord" intraop ON intraop."caseId" = c.id
      LEFT JOIN "PostoperativeRecord" postop ON postop."caseId" = c.id
      WHERE c.id = $1 AND c.status = 'COMPLETE'
      ON CONFLICT ("caseId") DO UPDATE SET
        "lastBatchId" = EXCLUDED."lastBatchId",
        "lastAction" = EXCLUDED."lastAction",
        "clinicalRevision" = EXCLUDED."clinicalRevision",
        "eventRevision" = EXCLUDED."eventRevision",
        "relationalRevision" = EXCLUDED."relationalRevision",
        "preopRevision" = EXCLUDED."preopRevision",
        "intraopRevision" = EXCLUDED."intraopRevision",
        "postopRevision" = EXCLUDED."postopRevision",
        "acceptedAt" = EXCLUDED."acceptedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `, [caseId, `e2e-central-${action.toLowerCase()}-${Date.now()}`, action, acceptedAt])
    if (checkpoint.rowCount !== 1) {
      throw new Error("E2E Central checkpoint requires one finalized case")
    }
    if (action === "WITHDRAW") {
      const control = await client.query(`
        UPDATE "CaseCentralExportControl"
        SET decision = 'WITHDRAWN', "updatedAt" = $2
        WHERE "caseId" = $1 AND decision = 'WITHDRAW_REQUESTED'
      `, [caseId, acceptedAt])
      if (control.rowCount !== 1) {
        throw new Error("E2E Central withdrawal acceptance requires one pending withdrawal")
      }
    }
  } finally {
    await client.end()
  }
}
