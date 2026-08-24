import { prisma } from "@/lib/prisma"
import { emitStatusEvent } from "@/lib/hospital/status-events"
import type { AuditActionCode } from "@/lib/audit-actions"
import { assertSafeAuditDetail } from "@/lib/audit-evidence"

// audit-evidence.ts is the single source of truth for the forbidden-field
// denylist and the transactional writer -- it deliberately has no
// server-only/global-Prisma dependency, so guarded installer/operator
// scripts share the same privacy boundary as Next routes instead of a
// second, driftable copy of it.
export { assertSafeAuditDetail, logAuditInTransaction } from "@/lib/audit-evidence"

/**
 * Best-effort audit for acts where losing the entry is survivable.
 *
 * Intentionally non-throwing: a failed audit write must not abort business
 * logic. That trade is right for routine, high-volume records — event edits,
 * case updates, blocked PII — and wrong for anything above; prefer
 * logAuditInTransaction where the evidence is the point.
 *
 * Callers should still await it so the write attempt completes before the
 * response is sent.
 */
export async function logAudit(
  userId: string,
  action: AuditActionCode,
  entityId: string,
  detail?: object,
): Promise<void> {
  try {
    assertSafeAuditDetail(detail)
    await prisma.auditLog.create({ data: { userId, action, entityId, detail } })
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err)
    void emitStatusEvent("AUDIT_WRITE_FAILED", {})
    // Do not rethrow — audit failure must not abort the caller's business logic.
  }
}
