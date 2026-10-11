import "server-only"

import { prisma } from "@/lib/prisma"

/**
 * Count finalised, identified cases whose latest revisions have not received a
 * signed Central acceptance. Unlike the old status count, accepted unchanged
 * cases disappear because their checkpoint revisions match the live record.
 */
export async function countCasesAwaitingCentralExport(institutionId: string): Promise<number> {
  return (await casesAwaitingCentralExport(institutionId)).count
}

/**
 * The same cases, and since when the oldest of them has been waiting (1.5.6).
 *
 * A case starts waiting at its last change: finalization, a later edit to any
 * of its sections, or a change to its Central decision. The latest of those is
 * the moment its current revision stopped matching what Central accepted.
 */
export async function casesAwaitingCentralExport(
  institutionId: string,
): Promise<{ count: number; oldestSince: Date | null }> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint; oldestSince: Date | null }>>`
    SELECT
      COUNT(*)::bigint AS "count",
      MIN(GREATEST(
        c."finalizedAt", c."updatedAt", preop."updatedAt", intraop."updatedAt",
        postop."updatedAt", control."updatedAt"
      )) AS "oldestSince"
    FROM "Case" AS c
    LEFT JOIN "CaseCentralExportControl" AS control
      ON control."caseId" = c."id"
    LEFT JOIN "CentralExportCheckpoint" AS checkpoint
      ON checkpoint."caseId" = c."id"
    LEFT JOIN "PreoperativeAssessment" AS preop
      ON preop."caseId" = c."id"
    LEFT JOIN "IntraoperativeRecord" AS intraop
      ON intraop."caseId" = c."id"
    LEFT JOIN "PostoperativeRecord" AS postop
      ON postop."caseId" = c."id"
    WHERE c."institutionId" = ${institutionId}
      AND c."status" = 'COMPLETE'
      AND c."finalizedAt" IS NOT NULL
      AND c."patientLinkId" IS NOT NULL
      AND COALESCE(control."decision"::text, 'DEFAULT') NOT IN ('EXCLUDE', 'WITHDRAWN')
      AND (
        (
          control."decision" = 'WITHDRAW_REQUESTED'
          AND checkpoint."caseId" IS NOT NULL
        )
        OR (
          COALESCE(control."decision"::text, 'DEFAULT') IN ('DEFAULT', 'INCLUDE')
          AND (
            checkpoint."caseId" IS NULL
            OR checkpoint."lastAction" <> 'UPSERT'
            OR checkpoint."clinicalRevision" <> c."clinicalRevision"
            OR checkpoint."eventRevision" <> c."eventRevision"
            OR checkpoint."relationalRevision" <> c."relationalRevision"
            OR checkpoint."preopRevision" IS DISTINCT FROM preop."syncRevision"
            OR checkpoint."intraopRevision" IS DISTINCT FROM intraop."syncRevision"
            OR checkpoint."postopRevision" IS DISTINCT FROM postop."syncRevision"
          )
        )
      )
  `
  return { count: Number(rows[0]?.count ?? 0), oldestSince: rows[0]?.oldestSince ?? null }
}
