import { randomUUID } from "node:crypto"
import { config as loadDotenv } from "dotenv"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const runPostgres = process.env.LOSPOR_POSTGRES_INTEGRATION === "true"
if (runPostgres && !process.env.DATABASE_URL && !process.env.DIRECT_URL) loadDotenv({ quiet: true })

describe.skipIf(!runPostgres)("Hospital control-plane PostgreSQL invariants", () => {
  const suffix = randomUUID()
  const institutionId = `control-inst-${suffix}`
  const adminId = `control-admin-${suffix}`
  const memberId = `control-member-${suffix}`
  const hodId = `control-hod-${suffix}`
  const researchId = `control-research-${suffix}`
  const inactiveId = `control-inactive-${suffix}`
  const legacyId = `control-legacy-${suffix}`
  let client: Client
  let savepoint = 0

  async function databaseError(sql: string, parameters: unknown[], expected: string) {
    const name = `expected_failure_${++savepoint}`
    await client.query(`SAVEPOINT ${name}`)
    let message = ""
    try {
      await client.query(sql, parameters)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    } finally {
      await client.query(`ROLLBACK TO SAVEPOINT ${name}`)
      await client.query(`RELEASE SAVEPOINT ${name}`)
    }
    expect(message).toContain(expected)
  }

  beforeAll(async () => {
    const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
    if (!connectionString) throw new Error("DATABASE_URL or DIRECT_URL is required")
    client = new Client({ connectionString })
    await client.connect()
    await client.query("BEGIN")
    await client.query(
      `INSERT INTO "Institution" (id, name, city) VALUES ($1, 'Control test', 'Test')`,
      [institutionId],
    )
    await client.query(
      `INSERT INTO "User"
        (id, email, name, "passwordHash", role, "accountKind", "institutionId", "emailVerifiedAt")
       VALUES
        ($1, $2, 'Operator', 'hash', 'ADMIN', 'CLINICAL', $7, NOW()),
        ($3, $4, 'Member', 'hash', 'MEMBER', 'CLINICAL', $7, NOW()),
        ($5, $6, 'Research', 'hash', 'RESEARCHER', 'RESEARCH_ONLY', $7, NOW()),
        ($8, $9, 'Inactive', 'hash', 'MEMBER', 'CLINICAL', $7, NULL),
        ($10, $11, 'Legacy', 'hash', 'CLINICIAN', 'CLINICAL', $7, NOW())`,
      [
        adminId, `operator-${suffix}@example.test`,
        memberId, `member-${suffix}@example.test`,
        researchId, `research-${suffix}@example.test`,
        institutionId,
        inactiveId, `inactive-${suffix}@example.test`,
        legacyId, `legacy-${suffix}@example.test`,
      ],
    )
    await client.query(
      `INSERT INTO "User"
        (id, email, name, "passwordHash", role, "accountKind", "institutionId", "emailVerifiedAt")
       VALUES ($1, $2, 'HOD', 'hash', 'HEAD_OF_DEPT', 'CLINICAL', $3, NOW())`,
      [hodId, `hod-${suffix}@example.test`, institutionId],
    )
  })

  afterAll(async () => {
    if (!client) return
    await client.query("ROLLBACK").catch(() => {})
    await client.end()
  })

  it("accepts explicit grants for active clinical and research-only principals", async () => {
    const eligible = [
      [`member-grant-${suffix}`, memberId],
      [`hod-grant-${suffix}`, hodId],
      [`admin-grant-${suffix}`, adminId],
      [`research-grant-${suffix}`, researchId],
    ]
    for (const [id, userId] of eligible) {
      await client.query(
        `INSERT INTO "ResearchAccessGrant"
          (id, "userId", "institutionId", "allInstitutions", "canQuery",
           "canInspectCases", "canExport", "canExportCsv", "canExportJson",
           "canExportOmop", "canShare", purpose, "grantedById", "expiresAt", "updatedAt")
         VALUES ($1, $2, $3, false, true, false, false, false, false,
           false, false, 'Approved protocol', $4, NOW() + INTERVAL '90 days', NOW())`,
        [id, userId, institutionId, adminId],
      )
    }
    const result = await client.query(
      `SELECT count(*)::int AS count FROM "ResearchAccessGrant" WHERE id = ANY($1::text[])`,
      [eligible.map(([id]) => id)],
    )
    expect(result.rows[0]?.count).toBe(4)
  })

  it("rejects inactive/legacy principals, overlong grants and mutable permission changes", async () => {
    const insert = `INSERT INTO "ResearchAccessGrant"
      (id, "userId", "institutionId", "allInstitutions", "canQuery",
       "canInspectCases", "canExport", "canExportCsv", "canExportJson",
       "canExportOmop", "canShare", purpose, "grantedById", "expiresAt", "updatedAt")
     VALUES ($1, $2, $3, false, true, false, false, false, false,
       false, false, 'Approved protocol', $4, NOW() + ($5 * INTERVAL '1 day'), NOW())`
    await databaseError(insert, [`inactive-grant-${suffix}`, inactiveId, institutionId, adminId, 90], "HOSPITAL_RESEARCH_PRINCIPAL_NOT_ELIGIBLE")
    await databaseError(insert, [`legacy-grant-${suffix}`, legacyId, institutionId, adminId, 90], "HOSPITAL_RESEARCH_PRINCIPAL_NOT_ELIGIBLE")
    await databaseError(insert, [`long-grant-${suffix}`, memberId, institutionId, adminId, 366], "HOSPITAL_RESEARCH_GRANT_EXPIRY_INVALID")
    await databaseError(
      `UPDATE "ResearchAccessGrant" SET "canInspectCases" = true WHERE id = $1`,
      [`member-grant-${suffix}`],
      "HOSPITAL_RESEARCH_GRANT_IMMUTABLE",
    )
  })

  it("allows one exact OMOP approval and makes it append-only", async () => {
    const grantId = `omop-grant-${suffix}`
    const exportId = `omop-export-${suffix}`
    const approvalId = `omop-approval-${suffix}`
    const definitionHash = "a".repeat(64)
    const snapshotHash = "b".repeat(64)
    await client.query(
      `INSERT INTO "ResearchAccessGrant"
        (id, "userId", "institutionId", "allInstitutions", "canQuery",
         "canInspectCases", "canExport", "canExportCsv", "canExportJson",
         "canExportOmop", "canShare", purpose, "grantedById", "expiresAt", "updatedAt")
       VALUES ($1, $2, $3, false, true, false, true, true, false,
         true, false, 'OMOP protocol', $4, NOW() + INTERVAL '90 days', NOW())`,
      [grantId, memberId, institutionId, adminId],
    )
    await client.query(
      `INSERT INTO "ResearchExport"
        (id, "ownerId", "institutionId", name, format, purpose, "researchGrantId",
         definition, "definitionHash", "snapshotHash", "snapshotCaseCount", "scopeInstitutionIds")
       VALUES ($1, $2, $3, 'Frozen cohort', 'omop-csv', 'OMOP protocol', $4,
         '{}'::jsonb, $5, $6, 17, ARRAY[$3]::text[])`,
      [exportId, memberId, institutionId, grantId, definitionHash, snapshotHash],
    )
    await client.query(
      `INSERT INTO "ResearchOmopApproval"
        (id, "exportId", "grantId", "requesterId", purpose, format,
         "definitionHash", "snapshotHash", "snapshotCaseCount", "approvedById", reason)
       VALUES ($1, $2, $3, $4, 'OMOP protocol', 'omop-csv', $5, $6, 17, $7,
         'Protocol committee approval')`,
      [approvalId, exportId, grantId, memberId, definitionHash, snapshotHash, adminId],
    )
    await databaseError(
      `UPDATE "ResearchOmopApproval" SET reason = 'A different approval reason' WHERE id = $1`,
      [approvalId],
      "HOSPITAL_OMOP_APPROVAL_IMMUTABLE",
    )
    await databaseError(
      `INSERT INTO "ResearchOmopApproval"
        (id, "exportId", "grantId", "requesterId", purpose, format,
         "definitionHash", "snapshotHash", "snapshotCaseCount", "approvedById", reason)
       VALUES ($1, $2, $3, $4, 'Changed purpose', 'omop-csv', $5, $6, 17, $7,
         'Protocol committee approval')`,
      [`mismatch-${suffix}`, exportId, grantId, memberId, definitionHash, snapshotHash, adminId],
      "HOSPITAL_OMOP_APPROVAL_DATASET_MISMATCH",
    )
  })

  it("enforces the singleton and complete external-AI sealed tuple in PostgreSQL", async () => {
    await databaseError(
      `INSERT INTO "HospitalExternalAiPolicy"
        (id, "externalAiEnabled", provider, "updatedAt")
       VALUES ('not-local', true, 'MISTRAL', NOW())`,
      [],
      "HospitalExternalAiPolicy_singleton_check",
    )
    await client.query(
      `INSERT INTO "HospitalExternalAiPolicy"
        (id, "externalAiEnabled", provider, "credentialCiphertext",
         "credentialNonce", "credentialAuthTag", "credentialKeyVersion",
         "credentialSealKeyFingerprint",
         "credentialConfiguredAt", "credentialChangedAt",
         "credentialChangedById", "updatedAt")
       VALUES ('local', true, 'MISTRAL', 'sealed', 'nonce', 'tag', 1, $2,
         NOW(), NOW(), $1, NOW())
       ON CONFLICT (id) DO UPDATE SET
         "externalAiEnabled" = EXCLUDED."externalAiEnabled",
         "credentialCiphertext" = EXCLUDED."credentialCiphertext",
         "credentialNonce" = EXCLUDED."credentialNonce",
         "credentialAuthTag" = EXCLUDED."credentialAuthTag",
         "credentialKeyVersion" = EXCLUDED."credentialKeyVersion",
         "credentialSealKeyFingerprint" = EXCLUDED."credentialSealKeyFingerprint",
         "credentialConfiguredAt" = EXCLUDED."credentialConfiguredAt",
         "credentialChangedAt" = EXCLUDED."credentialChangedAt",
         "credentialChangedById" = EXCLUDED."credentialChangedById",
         "updatedAt" = EXCLUDED."updatedAt"`,
      [adminId, `sha256:${"a".repeat(64)}`],
    )
    await databaseError(
      `UPDATE "HospitalExternalAiPolicy"
       SET "credentialAuthTag" = NULL, "updatedAt" = NOW()
       WHERE id = 'local'`,
      [],
      "HospitalExternalAiPolicy_sealed_tuple_check",
    )
  })
})
