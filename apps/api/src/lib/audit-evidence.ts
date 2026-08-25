import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import type { AuditActionCode } from "@/lib/audit-actions"

type Db = PrismaClient | Prisma.TransactionClient

const FORBIDDEN_DETAIL_KEYS = new Set([
  "address",
  "authtag",
  "casecode",
  "ciphertext",
  "clinicalpayload",
  "credential",
  "description",
  "email",
  "error",
  "errormessage",
  "firstname",
  "fullname",
  "lastname",
  "link",
  "message",
  "name",
  "nonce",
  "note",
  "notes",
  "password",
  "passwordhash",
  "patientid",
  "patientnumber",
  "payload",
  "phone",
  "privatekey",
  "purpose",
  "reason",
  "secret",
  "token",
  "tokenhash",
  "url",
])

function normalizedDetailKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Reject secret, patient, direct-PII, clinical-payload, and free-text fields. */
export function assertSafeAuditDetail(detail: object | undefined): void {
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object") return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    for (const [key, child] of Object.entries(value)) {
      const normalized = normalizedDetailKey(key)
      if (
        FORBIDDEN_DETAIL_KEYS.has(normalized)
        || normalized.endsWith("password")
        || normalized.endsWith("passwordhash")
        || normalized.endsWith("token")
        || normalized.endsWith("tokenhash")
        || normalized.endsWith("secret")
        || normalized.endsWith("credential")
        || normalized.endsWith("link")
        || normalized.endsWith("url")
        || normalized.endsWith("note")
        || normalized.endsWith("reason")
        || normalized.endsWith("casecode")
        || normalized.endsWith("patientnumber")
        || normalized.endsWith("clinicalpayload")
      ) {
        throw new Error(`Unsafe audit detail field: ${key}`)
      }
      visit(child)
    }
  }
  visit(detail)
}

/**
 * Write evidence through the caller's transaction; failure aborts the act.
 * This module deliberately has no `server-only` or global Prisma dependency,
 * so guarded installer/operator scripts can use the same writer and privacy
 * boundary as Next routes without creating a second audit implementation.
 */
export async function logAuditInTransaction(
  db: Db,
  userId: string,
  action: AuditActionCode,
  entityId: string,
  detail?: object,
  // Idempotent, replayable writers (e.g. bundled clinical-baseline
  // provisioning) need a deterministic id and a historical timestamp rather
  // than Prisma's defaults. Both stay optional so every other caller is
  // unaffected.
  overrides?: { id?: string; createdAt?: Date },
): Promise<void> {
  assertSafeAuditDetail(detail)
  await db.auditLog.create({ data: { ...overrides, userId, action, entityId, detail } })
}
