import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { AUDIT_ACTION_REGISTRY, type AuditActionCategory } from "@/lib/audit-actions"

type Db = PrismaClient | Prisma.TransactionClient

export const AUDIT_HISTORY_PAGE_SIZE = 50

/**
 * The categories of the change history in Status (10.3.0): what was changed in the hospital's settings and
 * accounts. Sign-ins and case work are not "changes" in that sense and stay out of it.
 */
export const AUDIT_HISTORY_CATEGORIES: readonly AuditActionCategory[] = [
  "ACCOUNT", "CENTRAL", "CLINICAL_RULES", "INSTITUTION", "MAINTENANCE", "RESEARCH", "SECURITY",
]

export type AuditHistoryQuery = { page?: number; category?: string | null; action?: string | null }

/**
 * Who changed what, and when, from the audit rows. The privacy rule of the other audit screens holds: the target id
 * and the row's detail stay in the database, and a reason an administrator gave is not an audit field at all.
 */
export async function auditHistory(db: Db, query: AuditHistoryQuery = {}) {
  const page = Number.isInteger(query.page) && (query.page ?? 0) > 0 ? query.page! : 0
  const category = AUDIT_HISTORY_CATEGORIES.find(item => item === query.category) ?? null
  const inScope = AUDIT_ACTION_REGISTRY.filter(item => (AUDIT_HISTORY_CATEGORIES as readonly string[]).includes(item.category))
  const chosen = query.action ? inScope.filter(item => item.code === query.action) : inScope.filter(item => !category || item.category === category)
  const definitions = new Map<string, (typeof inScope)[number]>(inScope.map(item => [item.code, item]))
  const where = { action: { in: chosen.map(item => item.code) } }

  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: page * AUDIT_HISTORY_PAGE_SIZE, take: AUDIT_HISTORY_PAGE_SIZE, select: { id: true, userId: true, action: true, createdAt: true } }),
  ])
  const ids = [...new Set(logs.map(log => log.userId))]
  const [users, principals] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, title: true } }),
    db.technicalPrincipal.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }),
  ])
  const who = new Map<string, string>([
    ...principals.map(item => [item.id, item.displayName] as [string, string]),
    ...users.map(item => [item.id, [item.title, item.name].filter(Boolean).join(" ")] as [string, string]),
  ])
  return {
    schemaVersion: 1,
    rows: logs.map(log => {
      const definition = definitions.get(log.action)
      return {
        id: log.id,
        at: log.createdAt.toISOString(),
        action: log.action,
        category: definition?.category ?? null,
        labelEn: definition?.labels.en ?? log.action,
        labelBg: definition?.labels.bg ?? log.action,
        who: who.get(log.userId) ?? null,
      }
    }),
    total,
    page,
    pageSize: AUDIT_HISTORY_PAGE_SIZE,
    categories: [...AUDIT_HISTORY_CATEGORIES],
    actions: inScope.map(item => ({ code: item.code, category: item.category, labelEn: item.labels.en, labelBg: item.labels.bg })),
  }
}
