import "server-only"

import { prisma } from "@/lib/prisma"
import { clinicalAiCapabilities } from "@/lib/hospital/ai-boundary"

/**
 * What the Status overview shows about use of the appliance (1.5.4).
 *
 * Totals only. Status is an operational console and holds no clinical record,
 * so nothing here names a person, a patient or a case: a count of people with
 * a session active in the last ten minutes, and how many cases were started and
 * finalized on each of the last thirty days. A failure leaves the block out
 * rather than failing the whole snapshot, which Status also uses for health.
 */

/** A session counts as "using it now" when it was seen within this window. */
export const ACTIVE_WINDOW_MS = 10 * 60 * 1000
export const ACTIVITY_DAYS = 30

export type ApplianceActivity = {
  activeUsers: number
  activeClinical: number
  activeResearch: number
  /** Oldest first, one entry per UTC day, ending today. */
  days: { day: string; started: number; finalized: number }[]
}

export type ApplianceIntegrations = {
  ehr: { configured: boolean; lastReceivedAt: string | null }
  ai: { enabled: boolean }
}

const dayKey = (time: number) => new Date(time).toISOString().slice(0, 10)

/** The last `count` UTC days, oldest first, each with its counts (zero when absent). */
export function dayBuckets(
  now: number,
  started: ReadonlyMap<string, number>,
  finalized: ReadonlyMap<string, number>,
  count = ACTIVITY_DAYS,
): ApplianceActivity["days"] {
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate())
  return Array.from({ length: count }, (_, index) => {
    const day = dayKey(today - (count - 1 - index) * 86_400_000)
    return { day, started: started.get(day) ?? 0, finalized: finalized.get(day) ?? 0 }
  })
}

type DayCount = { day: string; count: bigint }

export async function applianceActivity(now = Date.now()): Promise<ApplianceActivity | null> {
  try {
    const since = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()) - (ACTIVITY_DAYS - 1) * 86_400_000)
    const [sessions, started, finalized] = await Promise.all([
      prisma.authSession.findMany({
        where: {
          revokedAt: null,
          expiresAt: { gt: new Date(now) },
          lastSeenAt: { gte: new Date(now - ACTIVE_WINDOW_MS) },
        },
        select: { userId: true, user: { select: { accountKind: true } } },
        distinct: ["userId"],
      }),
      prisma.$queryRaw<DayCount[]>`
        SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "day", COUNT(*)::bigint AS "count"
        FROM "Case" WHERE "createdAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw<DayCount[]>`
        SELECT to_char("finalizedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "day", COUNT(*)::bigint AS "count"
        FROM "Case" WHERE "finalizedAt" >= ${since} GROUP BY 1`,
    ])
    const research = sessions.filter(session => session.user.accountKind === "RESEARCH_ONLY").length
    const toMap = (rows: DayCount[]) => new Map(rows.map(row => [row.day, Number(row.count)]))
    return {
      activeUsers: sessions.length,
      activeClinical: sessions.length - research,
      activeResearch: research,
      days: dayBuckets(now, toMap(started), toMap(finalized)),
    }
  } catch {
    return null
  }
}

export async function applianceIntegrations(): Promise<ApplianceIntegrations | null> {
  try {
    const [transport, latest, ai] = await Promise.all([
      prisma.hospitalEhrTransportPolicy.findUnique({ where: { id: "local" }, select: { transport: true } }),
      prisma.ehrImport.findFirst({ orderBy: { receivedAt: "desc" }, select: { receivedAt: true } }),
      clinicalAiCapabilities(),
    ])
    return {
      ehr: { configured: Boolean(transport?.transport), lastReceivedAt: latest?.receivedAt.toISOString() ?? null },
      ai: { enabled: ai.labImageExtraction.enabled || ai.monitorOcr.enabled || ai.clinicalAdvice.enabled },
    }
  } catch {
    return null
  }
}
