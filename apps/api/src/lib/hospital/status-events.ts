import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { z } from "zod"

const factsByCode = {
  AUDIT_WRITE_FAILED: z.object({}).strict(),
  EMAIL_DELIVERY_FAILED: z.object({
    category: z.enum(["verification", "password-reset", "transactional"]),
    failureKind: z.enum(["network", "provider", "configuration"]),
    httpStatus: z.number().int().min(100).max(599).optional(),
  }).strict(),
  AI_PROVIDER_REQUEST_FAILED: z.object({
    feature: z.enum(["advise", "case-advise", "read-labs", "vitals-scan"]),
    failureKind: z.enum(["timeout", "network", "provider", "invalid-response", "configuration"]),
    httpStatus: z.number().int().min(100).max(599).optional(),
  }).strict(),
  RESEARCH_EXPORT_WORKER_FAILED: z.object({
    stage: z.enum(["job", "worker", "cleanup"]),
    failedJobs: z.number().int().min(0).optional(),
  }).strict(),
  CENTRAL_DELIVERY_FAILED: z.object({
    stage: z.enum(["reserve", "generate", "upload", "receipt", "worker"]),
  }).strict(),
  CLINICAL_DATA_SYNC_FAILED: z.object({
    stage: z.enum(["field-audit", "snapshot", "relational"]),
  }).strict(),
  CLINICAL_WRITE_FAILED: z.object({
    operation: z.enum(["case-create", "case-update", "case-delete", "event-create", "event-update", "event-delete", "finalize", "unfinalize", "transfer"]),
  }).strict(),
  RESEARCH_REQUEST_FAILED: z.object({}).strict(),
  CLINICAL_DOCUMENT_RENDER_FAILED: z.object({}).strict(),
  CLINICAL_RULES_OPERATION_FAILED: z.object({
    operation: z.enum(["load", "write"]),
  }).strict(),
  APPLIANCE_OPERATOR_CHANGED: z.object({
    operation: z.enum(["initialize", "rotate", "transfer", "reconcile"]),
    credentialGeneration: z.number().int().min(1),
  }).strict(),
} as const

export type StatusEventCode = keyof typeof factsByCode
type FactsFor<C extends StatusEventCode> = z.infer<(typeof factsByCode)[C]>

export type SafeStatusEvent<C extends StatusEventCode = StatusEventCode> = {
  eventId: string
  occurredAt: string
  code: C
  facts: FactsFor<C>
}

export function makeSafeStatusEvent<C extends StatusEventCode>(
  code: C,
  facts: FactsFor<C>,
): SafeStatusEvent<C> | null {
  const parsed = factsByCode[code].safeParse(facts)
  if (!parsed.success) return null
  return {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    code,
    facts: parsed.data as FactsFor<C>,
  }
}

async function eventToken(): Promise<string | null> {
  const path = process.env.HOSPITAL_STATUS_EVENT_TOKEN_FILE?.trim()
  if (!path) return null
  try {
    const token = (await readFile(path, "utf8")).trim()
    return token.length >= 24 ? token : null
  } catch {
    return null
  }
}

/** Best-effort, bounded, and deliberately silent: telemetry cannot fail work. */
export async function emitStatusEvent<C extends StatusEventCode>(
  code: C,
  facts: FactsFor<C>,
): Promise<"sent" | "skipped" | "failed"> {
  const url = process.env.HOSPITAL_STATUS_EVENT_URL?.trim()
  const token = await eventToken()
  if (!url || !token) return "skipped"
  const event = makeSafeStatusEvent(code, facts)
  if (!event) return "failed"
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(750),
    })
    return response.ok ? "sent" : "failed"
  } catch {
    return "failed"
  }
}
